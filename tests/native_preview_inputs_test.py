# SPDX-License-Identifier: LicenseRef-Proprietary
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('inputs', Path(__file__).parent.parent / 'scripts/native-preview-inputs.py')
inputs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inputs)


class InputGuards(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='crossdraw-preview-inputs-')
        self.addCleanup(self.directory.cleanup)
        base = Path(self.directory.name)
        self.repo = base / 'source'; self.repo.mkdir()
        self.tools = base / 'tools'; self.tools.mkdir()
        (self.tools / 'package.json').write_text('{}')
        (self.tools / 'bun.lock').write_text('fixture lock')
        self.entry = self.tools / 'node_modules/.bin/wrangler'
        self.entry.parent.mkdir(parents=True)
        self.entry.write_text('#!/bin/sh\nexit 0\n')
        self.entry.chmod(0o700)
        self.dependency = self.tools / 'node_modules/transitive.js'
        self.dependency.write_text('export const fixture = 1')
        self.manifest = base / 'assets.json'
        hashes = {}
        for relative in inputs.ASSETS:
            path = self.repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('reviewed generated fixture: ' + relative)
            hashes[relative] = inputs.digest(path)
        self.manifest.write_text(json.dumps(hashes))
        self.tool_hash = inputs.tree_digest(self.tools)
        self.asset_hash = inputs.digest(self.manifest)

    def verify(self):
        return inputs.verify(self.repo, self.tools, self.tool_hash, self.manifest, self.asset_hash)

    def test_complete_tree_detects_dependency_changes_with_unchanged_entrypoint(self):
        self.assertEqual(self.verify(), str(self.entry))
        entry_hash = inputs.digest(self.entry)
        self.dependency.write_text('export const fixture = 2')
        self.assertEqual(inputs.digest(self.entry), entry_hash)
        with self.assertRaises(ValueError): self.verify()

    def test_escaping_tool_links_are_rejected(self):
        (self.tools / 'outside-link').symlink_to(self.manifest)
        with self.assertRaises(ValueError): inputs.tree_digest(self.tools)

    def test_asset_bytes_and_manifest_are_bound_to_review(self):
        (self.repo / 'public/font-previews.png').write_text('changed fixture')
        with self.assertRaises(ValueError): self.verify()

    def test_unknown_asset_paths_cannot_select_other_files(self):
        payload = json.loads(self.manifest.read_text())
        payload['../outside'] = '0' * 64
        self.manifest.write_text(json.dumps(payload))
        self.asset_hash = inputs.digest(self.manifest)
        with self.assertRaises(ValueError): self.verify()

    def test_asset_symlinks_are_not_followed(self):
        path = self.repo / 'public/font-previews.png'
        original = path.with_suffix('.backup'); path.rename(original)
        path.symlink_to(original)
        with self.assertRaises(ValueError): self.verify()


class ArtifactImportGuards(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='crossdraw-preview-artifacts-')
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        self.artifacts = self.base / 'artifacts'; self.artifacts.mkdir()
        self.binary = self.artifacts / 'crossdraw-server-linux-x64'
        self.target = self.base / 'owned-server'
        self.victim = self.base / 'source-file'; self.victim.write_text('preserve')

    def test_import_copies_only_regular_bytes_to_new_host_destination(self):
        self.binary.write_bytes(b'compiled fixture')
        inputs.import_binary(self.artifacts, self.target)
        self.assertEqual(self.target.read_bytes(), b'compiled fixture')
        self.assertFalse(self.target.is_symlink())

    def test_artifact_symlink_cannot_select_a_host_file(self):
        self.binary.symlink_to(self.victim)
        with self.assertRaises(OSError): inputs.import_binary(self.artifacts, self.target)
        self.assertFalse(self.target.exists())
        self.assertEqual(self.victim.read_text(), 'preserve')

    def test_artifact_directory_symlink_is_rejected(self):
        link = self.base / 'link'; link.symlink_to(self.artifacts, target_is_directory=True)
        with self.assertRaises(OSError): inputs.import_binary(link, self.target)

    def test_existing_destination_is_never_followed_or_replaced(self):
        self.binary.write_bytes(b'compiled fixture')
        self.target.symlink_to(self.victim)
        with self.assertRaises(FileExistsError): inputs.import_binary(self.artifacts, self.target)
        self.assertEqual(self.victim.read_text(), 'preserve')

    def test_oversized_and_hardlinked_artifacts_rejected_before_destination(self):
        with self.binary.open('wb') as output: output.truncate(256 * 1024 * 1024 + 1)
        with self.assertRaises(ValueError): inputs.import_binary(self.artifacts, self.target)
        self.assertFalse(self.target.exists())
        self.binary.unlink(); self.binary.hardlink_to(self.victim)
        with self.assertRaises(ValueError): inputs.import_binary(self.artifacts, self.target)
        self.assertFalse(self.target.exists())


if __name__ == '__main__':
    unittest.main()
