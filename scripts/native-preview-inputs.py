#!/usr/bin/env python3
# SPDX-License-Identifier: LicenseRef-Proprietary
"""Verify an isolated tool tree and four explicit generated build inputs."""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

ASSETS = {
    'public/font-previews.png',
    'src/fonts/preview-meta.json',
    'src/fonts/vendor/fontkit.mjs',
    'src/fonts/vendor/wawoff2-decompress.mjs',
}


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def tree_digest(root):
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError('The toolchain root must be a directory')
    def reject_unreadable(error):
        raise error
    entries = []
    for folder, directories, files in os.walk(root, followlinks=False, onerror=reject_unreadable):
        for name in sorted(directories + files):
            path = Path(folder) / name
            mode = path.lstat().st_mode
            relative = str(path.relative_to(root))
            if path.is_symlink():
                if not path.resolve(strict=True).is_relative_to(root):
                    raise ValueError('Toolchain links must remain inside its dedicated tree')
                entries.append([relative, 'link', os.readlink(path)])
            elif stat.S_ISREG(mode):
                entries.append([relative, 'file', mode & 0o111, digest(path)])
            elif not stat.S_ISDIR(mode):
                raise ValueError('Toolchain contains a special file')
    return hashlib.sha256(json.dumps(sorted(entries), separators=(',', ':')).encode()).hexdigest()


def verify(repo, tools, expected_tree, manifest, expected_assets):
    repo, tools = repo.resolve(strict=True), tools.resolve(strict=True)
    if tools.is_relative_to(repo) or repo.is_relative_to(tools):
        raise ValueError('Use a distinct, dedicated Wrangler toolchain tree')
    if not (tools / 'package.json').is_file() or not any(
        (tools / name).is_file() for name in ['bun.lock', 'package-lock.json', 'pnpm-lock.yaml']
    ):
        raise ValueError('The dedicated installed Wrangler toolchain needs its own manifest and lockfile')
    if tree_digest(tools) != expected_tree:
        raise ValueError('The reviewed Wrangler implementation tree changed')
    entry = tools / 'node_modules/.bin/wrangler'
    if not entry.resolve(strict=True).is_relative_to(tools) or not os.access(entry, os.X_OK):
        raise ValueError('The dedicated Wrangler entrypoint is missing')
    if manifest.is_symlink() or not manifest.is_file() or manifest.stat().st_size > 16384:
        raise ValueError('Invalid generated-asset manifest')
    if digest(manifest) != expected_assets:
        raise ValueError('The reviewed generated-asset manifest changed')
    hashes = json.loads(manifest.read_text())
    if not isinstance(hashes, dict) or set(hashes) != ASSETS:
        raise ValueError('The manifest must identify exactly the four generated font/vendor assets')
    for relative, expected in hashes.items():
        path = repo / relative
        if (
            not isinstance(expected, str) or len(expected) != 64
            or path.is_symlink() or not path.is_file()
            or not path.resolve(strict=True).is_relative_to(repo)
            or path.stat().st_size > 32 * 1024 * 1024
            or digest(path) != expected
        ):
            raise ValueError('A reviewed generated asset is missing or changed')
    return str(entry.resolve(strict=True))


def import_binary(artifacts, destination):
    # The container may choose any artifact name or link. Only copy this bounded
    # regular file through no-follow descriptors into the host-owned build context.
    directory = os.open(artifacts, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        source = os.open('crossdraw-server-linux-x64', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        with os.fdopen(source, 'rb') as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= 256 * 1024 * 1024:
                raise ValueError('Compiled artifact must be one bounded regular file')
            target = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o700)
            with os.fdopen(target, 'wb') as output:
                remaining = before.st_size
                while remaining:
                    chunk = stream.read(min(remaining, 1024 * 1024))
                    if not chunk:
                        raise ValueError('Compiled artifact changed while importing')
                    output.write(chunk)
                    remaining -= len(chunk)
                after = os.fstat(stream.fileno())
                if stream.read(1) or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                    raise ValueError('Compiled artifact changed while importing')
                output.flush()
                os.fsync(output.fileno())
    finally:
        os.close(directory)


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] == 'tree-hash':
            print(tree_digest(Path(sys.argv[2])))
        elif len(sys.argv) == 4 and sys.argv[1] == 'import-binary':
            import_binary(Path(sys.argv[2]), Path(sys.argv[3]))
        elif len(sys.argv) == 7 and sys.argv[1] == 'verify':
            print(verify(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4], Path(sys.argv[5]), sys.argv[6]))
        else:
            raise ValueError('Expected tree-hash ROOT, import-binary ARTIFACTS DESTINATION or verify REPO TOOLS TREE_SHA ASSET_MANIFEST ASSET_SHA')
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(1)
