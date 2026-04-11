/**
 * Builds the fontkit + wawoff2 browser bundles and vendors them into
 * src/fonts/vendor/. Both libraries ship with browser-hostile source:
 *
 *  • fontkit's published browser-module.mjs has unresolved bare-specifier
 *    imports (`restructure`, `@swc/helpers`, …). `bun build` inlines them.
 *
 *  • wawoff2's Emscripten binding only assigns `module.exports = Module`
 *    inside its ENVIRONMENT_IS_NODE branch. In a bundled browser closure
 *    that leaves the decompress wrapper talking to a stale `{}`, so
 *    `onRuntimeInitialized` never fires and `await decompress()` hangs
 *    forever. We patch the bundled output to also expose the Module in
 *    the web branch.
 *
 * Run once at install / CI time; the vendored bundles are consumed by
 * src/fonts/glyph-paths.ts at runtime.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT_DIR = 'src/fonts/vendor'
const FONTKIT_ENTRY = './node_modules/fontkit/dist/browser-module.mjs'
const WAWOFF2_ENTRY = './node_modules/wawoff2/decompress.js'
const FONTKIT_OUT = `${OUT_DIR}/fontkit.mjs`
const WAWOFF2_OUT = `${OUT_DIR}/wawoff2-decompress.mjs`

mkdirSync(OUT_DIR, { recursive: true })

function bundle(entry: string, outfile: string): void {
  mkdirSync(dirname(outfile), { recursive: true })
  const res = spawnSync('bun', ['build', entry, '--target=browser', '--format=esm', '--outfile=' + outfile], {
    stdio: 'inherit',
  })
  if (res.status !== 0) {
    throw new Error(`Failed to bundle ${entry}`)
  }
}

bundle(FONTKIT_ENTRY, FONTKIT_OUT)
bundle(WAWOFF2_ENTRY, WAWOFF2_OUT)

// Patch the wawoff2 bundle so Module is exported in the browser branch.
// The Emscripten binding only sets module.exports inside ENVIRONMENT_IS_NODE,
// which leaves the decompress wrapper bound to an empty `{}` object and
// its runtimeInit promise unreachable. Injecting the assignment next to
// `Module["run"] = run;` runs before `run();` kicks off WASM init, so when
// the wrapper later attaches `onRuntimeInitialized` it's attaching to the
// real Module object. (Without this patch, `await decompress()` hangs.)
const orig = readFileSync(WAWOFF2_OUT, 'utf8')
const MARKER = 'Module["run"] = run;'
if (!orig.includes(MARKER)) {
  throw new Error(`Patch marker '${MARKER}' not found in wawoff2 bundle`)
}
const patched = orig.replace(MARKER, `${MARKER} module.exports = Module;`)
writeFileSync(WAWOFF2_OUT, patched)

console.log(`✓ wrote ${FONTKIT_OUT}`)
console.log(`✓ wrote ${WAWOFF2_OUT} (patched)`)
