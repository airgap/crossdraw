/**
 * Plugin sandbox — runs untrusted plugin code with only the CrossdrawPluginAPI
 * exposed. Prevents access to window, document, fetch, and other browser globals.
 */

import type { CrossdrawPluginAPI } from './plugin-api'

/**
 * List of global names that should be explicitly masked (set to undefined)
 * inside the sandbox so plugin code cannot reach them.
 */
const BLOCKED_GLOBALS = [
  'window',
  'self',
  'globalThis',
  'document',
  'location',
  'navigator',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'importScripts',
  'eval',
  'Function',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'requestIdleCallback',
  'queueMicrotask',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'crypto',
  'performance',
  'history',
  'alert',
  'confirm',
  'prompt',
  'open',
  'close',
  'postMessage',
] as const

/**
 * Run plugin source code in a minimal sandbox.
 *
 * The sandbox uses `new Function()` to create an isolated scope. All dangerous
 * browser globals are explicitly shadowed with `undefined` so the plugin code
 * cannot reference them. The only value injected is the `api` object conforming
 * to CrossdrawPluginAPI.
 *
 * Note: This is a "best effort" in-process sandbox — it does NOT provide the
 * same level of security as a Web Worker or iframe sandbox. For production use,
 * consider running plugins in a Worker with structured-clone message passing.
 *
 * @param code  The plugin source code (a JavaScript string).
 *              The code can reference `api` as a global variable.
 * @param api   The CrossdrawPluginAPI instance to expose to the plugin.
 */
export function runPluginInSandbox(code: string, api: CrossdrawPluginAPI): void {
  // Build the parameter names and values arrays.
  // The first parameter is always `api`, followed by all blocked globals set to undefined.
  const paramNames: string[] = ['api', ...BLOCKED_GLOBALS]
  const paramValues: unknown[] = [api]

  // All blocked globals receive `undefined`
  for (let i = 0; i < BLOCKED_GLOBALS.length; i++) {
    paramValues.push(undefined)
  }

  // Wrap the plugin code in "use strict" to prevent accidental global leaks
  const wrappedCode = `"use strict";\n${code}`

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const sandboxedFn = new Function(...paramNames, wrappedCode)
    sandboxedFn(...paramValues)
  } catch (err) {
    console.error('[PluginSandbox] Error executing plugin code:', err)
    throw err
  }
}

/**
 * Create a frozen, read-only proxy of the API so plugin code cannot replace
 * methods on the API object itself.
 */
export function createFrozenAPI(api: CrossdrawPluginAPI): CrossdrawPluginAPI {
  return Object.freeze({ ...api })
}

/**
 * Run plugin code with a frozen API — the recommended way to execute untrusted
 * plugins. Combines `createFrozenAPI` + `runPluginInSandbox`.
 */
export function runPluginSafe(code: string, api: CrossdrawPluginAPI): void {
  runPluginInSandbox(code, createFrozenAPI(api))
}
