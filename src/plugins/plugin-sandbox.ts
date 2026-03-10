/**
 * Plugin sandbox — runs untrusted plugin code with only the CrossdrawPluginAPI
 * exposed. Prevents access to window, document, fetch, and other browser globals.
 */

import type { CrossdrawPluginAPI } from './plugin-api'

/**
 * Property names that allow escaping the sandbox via the constructor chain
 * (e.g. `api.getDocument.constructor('return this')()`) or prototype
 * manipulation. Accessing any of these on a proxied object returns `undefined`.
 */
const DANGEROUS_PROPS: ReadonlySet<string | symbol> = new Set([
  'constructor',
  'prototype',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
])

/**
 * Wrap an object in a Proxy that blocks access to prototype-climbing
 * properties. Any function values returned from the proxy are themselves
 * wrapped so the entire object graph is protected — a plugin cannot reach
 * the real `Function` constructor through *any* reference chain.
 *
 * A WeakMap cache ensures each source object is wrapped at most once,
 * preventing infinite recursion on circular references.
 */
function createSafeProxy<T extends object>(obj: T, cache = new WeakMap<object, object>()): T {
  if (cache.has(obj)) return cache.get(obj) as T

  const proxy = new Proxy(obj, {
    get(target, prop, receiver) {
      if (DANGEROUS_PROPS.has(prop)) return undefined

      const value = Reflect.get(target, prop, receiver)

      // Wrap returned functions so that fn.constructor is also blocked
      if (typeof value === 'function') {
        const wrappedFn = function (this: unknown, ...args: unknown[]) {
          return value.apply(this === proxy ? target : this, args)
        }
        // The wrapped function itself needs a safe proxy to block
        // wrappedFn.constructor access
        return createSafeProxy(wrappedFn, cache)
      }

      // Wrap returned objects (but not null/primitives)
      if (value !== null && typeof value === 'object') {
        return createSafeProxy(value as object, cache)
      }

      return value
    },

    set(target, prop, value) {
      if (DANGEROUS_PROPS.has(prop)) return true // silently discard
      return Reflect.set(target, prop, value)
    },
  })

  cache.set(obj, proxy)
  return proxy as T
}

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
  const paramValues: unknown[] = [createSafeProxy(api as unknown as object)]

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
