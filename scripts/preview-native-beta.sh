#!/bin/sh
# SPDX-License-Identifier: LicenseRef-Proprietary
set -eu

fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "$#" -eq 9 ] || fail 'Usage: preview-native-beta.sh SOURCE_SHA PARABUN_SHA256 WRANGLER_ROOT TOOL_TREE_SHA256 ASSET_MANIFEST ASSET_SHA256 BUILDER_IMAGE_ID RUNTIME_IMAGE NEW_OUTPUT_DIR'
source_sha=$1; parabun_sha=$2; tool_root=$3; tool_sha=$4
assets=$5; assets_sha=$6; builder=$7; runtime=$8; output=$9
hex() { case "$1" in ''|*[!0-9a-f]*) return 1 ;; esac; [ "${#1}" -eq "$2" ]; }
hex "$source_sha" 40 || fail 'Require an exact reviewed source SHA'
hex "$parabun_sha" 64 && hex "$tool_sha" 64 && hex "$assets_sha" 64 || fail 'Require reviewed tool and asset SHA256 hashes'
case "$builder" in sha256:*) builder_digest=${builder#sha256:} ;; *) fail 'Require an immutable cached local builder image ID' ;; esac
hex "$builder_digest" 64 || fail 'Require an immutable cached local builder image ID'
case "$runtime" in gcr.io/distroless/base-debian12@sha256:*) digest=${runtime##*@sha256:} ;; *) fail 'Require an immutable reviewed distroless runtime image' ;; esac
hex "$digest" 64 || fail 'Require an immutable reviewed distroless runtime image'
for path in "$tool_root" "$assets" "$output"; do
  case "$path" in /*) ;; *) fail 'Tools, asset manifest and new output require absolute paths' ;; esac
done
output=$(realpath -m "$output")
[ ! -e "$output" ] && [ ! -L "$output" ] || fail 'Output already exists'
repo=$(git rev-parse --show-toplevel); cd "$repo"
case "$output/" in "$repo/"*) fail 'Keep preview output outside the source checkout' ;; esac
[ "$(git rev-parse HEAD)" = "$source_sha" ] || fail 'Checkout does not match reviewed source'
[ -z "$(git status --porcelain=v1 --untracked-files=all)" ] || fail 'Source checkout must be clean'
tool_root=$(realpath "$tool_root")
case "$output/" in "$tool_root/"*) fail 'Keep preview output outside the toolchain tree' ;; esac
for file in .env .env.* .dev.vars .dev.vars.*; do
  [ ! -e "$file" ] && continue
  case "$file" in *.example|*.sample) ;; *) fail 'Remove private dotenv inputs from the owned preview checkout' ;; esac
done
[ -d node_modules ] && [ ! -L node_modules ] || fail 'Install lockfile dependencies in this owned checkout first'
[ -x /usr/local/bin/parabun ] || fail 'Reviewed Parabun is missing'
[ "$(sha256sum /usr/local/bin/parabun | cut -d ' ' -f1)" = "$parabun_sha" ] || fail 'Parabun hash changed'
docker=$(command -v docker) || fail 'Local Docker CLI is missing'
for path in "$repo" "$tool_root" "$assets" "$output"; do
  case "$path" in *','*) fail 'Docker mount paths cannot contain commas' ;; esac
done
for path in "$tool_root" "$output"; do
  case "$path" in /work|/work/*|/src|/src/*|/preview|/preview/*|/tmp|/tmp/*) fail 'Use paths outside the reserved builder mount points' ;; esac
done

umask 077
mkdir "$output"; mkdir "$output/home" "$output/tools" "$output/artifacts"
run() {
  env -i HOME="$output/home" XDG_CONFIG_HOME="$output/home/.config" \
    PATH="$output/tools:$repo/node_modules/.bin:/usr/local/bin:/usr/bin:/bin" \
    LANG=C.UTF-8 CI=true NO_COLOR=1 WRANGLER_SEND_METRICS=false \
    DOCKER_HOST=unix:///var/run/docker.sock DOCKER_BUILDKIT=0 "$@"
}
stage=inputs; job="$source_sha-$$"; tag="crossdraw-native-beta-preview:$job"
finish() {
  status=$?; trap - 0 1 2 15
  cleanup=retained-local-preview; cleanup_errors=''
  if [ -f "$output/builder-container-id.txt" ]; then
    container=$(cat "$output/builder-container-id.txt")
    owner=$(run "$docker" --host unix:///var/run/docker.sock inspect "$container" --format '{{index .Config.Labels "org.crossdraw.native-preview-builder"}}' 2>/dev/null || true)
    if [ "$owner" = "$job" ]; then
      if ! run "$docker" --host unix:///var/run/docker.sock rm -f "$container" > "$output/builder-cleanup.log" 2>&1; then status=1; cleanup_errors="$cleanup_errors builder"; fi
    fi
  fi
  if [ -f "$output/runtime-lease-id.txt" ]; then
    lease=$(cat "$output/runtime-lease-id.txt")
    owner=$(run "$docker" --host unix:///var/run/docker.sock inspect "$lease" --format '{{index .Config.Labels "org.crossdraw.native-preview-lease"}}' 2>/dev/null || true)
    if [ "$owner" = "$job" ]; then
      if ! run "$docker" --host unix:///var/run/docker.sock rm -f "$lease" > "$output/runtime-lease-cleanup.log" 2>&1; then status=1; cleanup_errors="$cleanup_errors runtime-lease"; fi
    fi
  fi
  if [ "$status" -ne 0 ] && [ -f "$output/image-id.txt" ]; then
    held=$(run "$docker" --host unix:///var/run/docker.sock image inspect "$tag" --format '{{.Id}} {{index .Config.Labels "org.crossdraw.native-preview"}}' 2>/dev/null || true)
    if [ "$held" = "$(cat "$output/image-id.txt") $job" ]; then
      if run "$docker" --host unix:///var/run/docker.sock image rm "$tag" > "$output/image-cleanup.log" 2>&1; then cleanup=removed-owned-failed-tag; else cleanup_errors="$cleanup_errors image-tag"; fi
    else cleanup=no-matching-owned-tag; fi
  fi
  run /usr/bin/python3 - "$output" "$source_sha" "$parabun_sha" "$tool_sha" "$assets_sha" "$runtime" "$status" "$stage" "$cleanup" "$builder" "$cleanup_errors" <<'PY'
import hashlib,json,sys
from pathlib import Path
output=Path(sys.argv[1]); status=int(sys.argv[7]); passed=status==0
files={str(p.relative_to(output)):hashlib.sha256(p.read_bytes()).hexdigest()
       for p in output.rglob('*') if p.is_file() and not p.is_symlink() and 'home' not in p.relative_to(output).parts}
receipt={'source':sys.argv[2],'parabun_sha256':sys.argv[3],'wrangler_tree_sha256':sys.argv[4],
         'generated_assets_manifest_sha256':sys.argv[5],'runtime_image':sys.argv[6],
         'local_preview_passed':passed,'exit_code':status,'stage':sys.argv[8],'image_cleanup':sys.argv[9],
         'cleanup_errors':sys.argv[11].split(),
         'builder_image':sys.argv[10],'builder_network':'none','builder_source_deps_tools':'read-only mounts',
         'builder_workspace':'private tmpfs discarded; host source has no generated writes',
         'generated_font_vendor_inputs':'network font generator excluded; test-local vendor rebuilds must match the reviewed assets',
         'partial_evidence_retained':True,'deployment':False,'publication':False,
         'live_account_acceptance':False,'browser_render_acceptance':False,
         'test_scope':'Unmodified package suite; existing Chrome-conditional skips are visible in artifacts/tests.log',
         'files':files}
(output/('receipt.json' if passed else 'failure.json')).write_text(json.dumps(receipt,indent=2)+'\n')
PY
  exit "$status"
}
trap finish 0
trap 'exit 130' 1 2 15
wrangler=$(run /usr/bin/python3 scripts/native-preview-inputs.py verify "$repo" "$tool_root" "$tool_sha" "$assets" "$assets_sha")
cat > "$output/tools/bun" <<'SH'
#!/bin/sh
exec /preview/parabun "$@"
SH
cat > "$output/tools/bunx" <<'SH'
#!/bin/sh
exec /preview/parabun x --no-install "$@"
SH
cp "$output/tools/bun" "$output/tools/parabun"
chmod 700 "$output/tools/bun" "$output/tools/bunx" "$output/tools/parabun"
stage=runtime-cache
run "$docker" --host unix:///var/run/docker.sock image inspect "$builder" --format '{{.Id}}' > "$output/builder-image-id.txt"
run "$docker" --host unix:///var/run/docker.sock image inspect "$runtime" --format '{{.Id}}' > "$output/runtime-image-id.txt"
base_id=$(cat "$output/runtime-image-id.txt")
case "$base_id" in sha256:*) hex "${base_id#sha256:}" 64 || fail 'Invalid cached runtime identity' ;; *) fail 'Invalid cached runtime identity' ;; esac
if run "$docker" --host unix:///var/run/docker.sock image inspect "$tag" >/dev/null 2>&1; then fail 'Owned preview tag already exists'; fi
# A running, offline, data-free lease also checks this exact compiler runtime's libc compatibility.
# Ordinary container/image pruning cannot discard a base still used by this owned running fixture.
run "$docker" --host unix:///var/run/docker.sock run --detach --pull=never --network=none --read-only \
  --cap-drop=ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs "/tmp:rw,exec,nosuid,nodev,size=64m,uid=$(id -u),gid=$(id -g),mode=0700" --env HOME=/tmp \
  --mount type=bind,src=/usr/local/bin/parabun,dst=/preview/parabun,readonly \
  --label "org.crossdraw.native-preview-lease=$job" --entrypoint /preview/parabun "$runtime" \
  -e 'setInterval(() => {}, 1000)' > "$output/runtime-lease-id.txt"
lease=$(cat "$output/runtime-lease-id.txt")
[ "$(run "$docker" --host unix:///var/run/docker.sock inspect "$lease" --format '{{.State.Running}} {{index .Config.Labels "org.crossdraw.native-preview-lease"}}')" = "true $job" ] || fail 'The cached runtime cannot run the reviewed compiler binary'
git ls-files -z > "$output/source-files.nul"
printf '%s\0' public/font-previews.png src/fonts/preview-meta.json src/fonts/vendor/fontkit.mjs src/fonts/vendor/wawoff2-decompress.mjs >> "$output/source-files.nul"
cat > "$output/build.sh" <<'SH'
#!/bin/sh
set -eu
output=$1; wrangler=$2; tool_root=$3; tool_sha=$4; assets_sha=$5; parabun_sha=$6
mkdir -p /tmp/home
tar --null --verbatim-files-from -C /src -cf /tmp/source.tar -T "$(dirname "$output")/source-files.nul"
tar -C /work -xf /tmp/source.tar
cd /work
[ "$(sha256sum /preview/parabun | cut -d ' ' -f1)" = "$parabun_sha" ]
/usr/bin/python3 scripts/native-preview-inputs.py verify /work "$tool_root" "$tool_sha" /preview/assets-manifest.json "$assets_sha" > "$output/builder-verified-tool-path.txt"
"$wrangler" --version > "$output/wrangler-version.txt"
"$wrangler" deploy --help > "$output/wrangler-deploy-help.txt"
for flag in --dry-run --outdir --env; do grep -Fq -- "$flag" "$output/wrangler-deploy-help.txt"; done
/preview/parabun --version > "$output/parabun-version.txt"
# Build from reviewed assets, bypassing the network font generator in the package build script.
/preview/parabun x --no-install tsc -b > "$output/typecheck.log" 2>&1
/preview/parabun x --no-install vite build > "$output/build.log" 2>&1
/preview/parabun test > "$output/tests.log" 2>&1
# Existing integration tests rebuild vendors locally; require the same reviewed bytes afterward.
/usr/bin/python3 scripts/native-preview-inputs.py verify /work "$tool_root" "$tool_sha" /preview/assets-manifest.json "$assets_sha" > "$output/builder-reverified-tool-path.txt"
# https://developers.cloudflare.com/workers/wrangler/commands/workers/#deploy
"$wrangler" deploy --dry-run --env beta --outdir "$output/worker" > "$output/worker-dry-run.log" 2>&1
/preview/parabun server/bundle-dist.ts > "$output/server-assets.log" 2>&1
/preview/parabun build server/main.ts --compile --target=bun-linux-x64 --outfile "$output/crossdraw-server-linux-x64" > "$output/server-compile.log" 2>&1
cp -a dist "$output/web-dist"
SH
chmod 700 "$output/build.sh"
stage=isolated-build
uid=$(id -u); gid=$(id -g)
run "$docker" --host unix:///var/run/docker.sock run --rm --pull=never --network=none --read-only \
  --cap-drop=ALL --security-opt no-new-privileges --user "$uid:$gid" \
  --label "org.crossdraw.native-preview-builder=$job" --cidfile "$output/builder-container-id.txt" \
  --tmpfs "/tmp:rw,exec,nosuid,nodev,size=1g,uid=$uid,gid=$gid,mode=0700" \
  --tmpfs "/work:rw,exec,nosuid,nodev,size=1g,uid=$uid,gid=$gid,mode=0700" \
  --mount "type=bind,src=$repo,dst=/src,readonly" \
  --mount "type=bind,src=$repo/node_modules,dst=/work/node_modules,readonly" \
  --mount "type=bind,src=$tool_root,dst=$tool_root,readonly" \
  --mount "type=bind,src=$assets,dst=/preview/assets-manifest.json,readonly" \
  --mount "type=bind,src=/usr/local/bin/parabun,dst=/preview/parabun,readonly" \
  --mount "type=bind,src=$output,dst=$output,readonly" \
  --mount "type=bind,src=$output/artifacts,dst=$output/artifacts" --entrypoint /usr/bin/env "$builder" -i \
  HOME=/tmp/home XDG_CONFIG_HOME=/tmp/home/.config \
  PATH="$output/tools:/work/node_modules/.bin:/usr/local/bin:/usr/bin:/bin" LANG=C.UTF-8 CI=true \
  NO_COLOR=1 WRANGLER_SEND_METRICS=false BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-cache \
  /bin/sh "$output/build.sh" "$output/artifacts" "$wrangler" "$tool_root" "$tool_sha" "$assets_sha" "$parabun_sha"
# Import only a bounded regular compiled binary; never follow a builder-created link.
# Host controls and packaging are outside the builder-writable artifact mount.
mkdir "$output/packaging"
run /usr/bin/python3 scripts/native-preview-inputs.py import-binary "$output/artifacts" "$output/packaging/crossdraw-server-linux-x64"
cat > "$output/packaging/Dockerfile" <<'DOCKER'
ARG RUNTIME_IMAGE
FROM ${RUNTIME_IMAGE}
COPY crossdraw-server-linux-x64 /app/server
ENV CROSSDRAW_DATA_DIR=/app/data
EXPOSE 3000
ENTRYPOINT ["/app/server"]
DOCKER
stage=local-docker
[ "$(run "$docker" --host unix:///var/run/docker.sock inspect "$lease" --format '{{.State.Running}} {{index .Config.Labels "org.crossdraw.native-preview-lease"}}')" = "true $job" ] || fail 'The owned cached runtime lease stopped'
run "$docker" --host unix:///var/run/docker.sock build --pull=false --network=none \
  --build-arg "RUNTIME_IMAGE=$base_id" --tag "$tag" --label "org.crossdraw.native-preview=$job" \
  --iidfile "$output/image-id.txt" --file "$output/packaging/Dockerfile" "$output/packaging" > "$output/docker-build.log" 2>&1
[ -s "$output/image-id.txt" ] || fail 'Local Docker build did not identify its image'
held=$(run "$docker" --host unix:///var/run/docker.sock image inspect "$tag" --format '{{.Id}} {{index .Config.Labels "org.crossdraw.native-preview"}}')
[ "$held" = "$(cat "$output/image-id.txt") $job" ] || fail 'Local preview image ownership changed'
stage=final-integrity
[ "$(git rev-parse HEAD)" = "$source_sha" ] || fail 'Source HEAD changed during preview'
[ -z "$(git status --porcelain=v1 --untracked-files=all)" ] || fail 'Build changed source; retain logs and review the changes'
[ "$(sha256sum /usr/local/bin/parabun | cut -d ' ' -f1)" = "$parabun_sha" ] || fail 'Parabun changed during preview'
run /usr/bin/python3 scripts/native-preview-inputs.py verify "$repo" "$tool_root" "$tool_sha" "$assets" "$assets_sha" > "$output/verified-tool-path.txt"
stage=complete
