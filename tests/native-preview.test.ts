// SPDX-License-Identifier: LicenseRef-Proprietary
import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const script = fileURLToPath(new URL('../scripts/preview-native-beta.sh', import.meta.url))
const hash = '0'.repeat(64)
function inputs(source: string, runtime: string, output: string) {
  return [source, hash, '/missing/toolchain', hash, '/missing/assets.json', hash, `sha256:${hash}`, runtime, output]
}
function rejected(args: string[], cwd?: string) {
  const result = Bun.spawnSync(['sh', script, ...args], { cwd, env: { PATH: '/usr/bin:/bin' } })
  expect(result.exitCode).not.toBe(0)
  return result.stderr.toString()
}
test('native preview requires explicit reviewed inputs before running a tool', () => {
  const output = `/tmp/crossdraw-native-preview-negative-${randomUUID()}`
  expect(rejected([])).toContain('Usage:')
  expect(rejected(inputs('main', 'runtime:latest', output))).toContain('exact reviewed source SHA')
  expect(rejected(inputs('0'.repeat(40), 'runtime:latest', output))).toContain('immutable reviewed distroless')
  const fixture = mkdtempSync(join(tmpdir(), 'crossdraw-preview-git-'))
  try {
    const env = { PATH: '/usr/bin:/bin', HOME: fixture, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
    for (const args of [
      ['init', '-q'],
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@invalid.example',
        'commit',
        '--allow-empty',
        '-qm',
        'Fixture',
      ],
    ])
      expect(Bun.spawnSync(['git', ...args], { cwd: fixture, env }).exitCode).toBe(0)
    expect(
      rejected(inputs('0'.repeat(40), `gcr.io/distroless/base-debian12@sha256:${hash}`, output), fixture),
    ).toContain('Checkout does not match reviewed source')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('the local input verifier detects transitive tool and generated-asset changes', () => {
  const tests = fileURLToPath(new URL('./native_preview_inputs_test.py', import.meta.url))
  const result = Bun.spawnSync(['/usr/bin/python3', tests], { env: { PATH: '/usr/bin:/bin' } })
  expect(result.exitCode, result.stderr.toString()).toBe(0)
})
