#!/usr/bin/env bun

// Canary health check script for Crossdraw deployments.
//
// Usage:
//   bun scripts/canary.ts <url> [--api-url <url>] [--interval 30] [--duration 600] [--once]
//
// Checks per round:
//   1. Page load — GET / returns 200 with HTML
//   2. Worker health — GET /health returns { status: "ok" }
//   3. Static asset — parses HTML for a JS bundle, fetches it
//   4. API health (if --api-url) — GET <api>/health returns { status: "ok" }
//
// Exits 0 if the final round passes, 1 otherwise.

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const baseUrl = positional[0]
const once = args.includes('--once')
const interval = Number(args[args.indexOf('--interval') + 1]) || 30
const duration = Number(args[args.indexOf('--duration') + 1]) || 600
const apiUrl = args.includes('--api-url') ? args[args.indexOf('--api-url') + 1] : undefined

if (!baseUrl) {
  console.error('Usage: bun scripts/canary.ts <url> [--api-url <url>] [--interval 30] [--duration 600] [--once]')
  process.exit(1)
}

interface CheckResult {
  name: string
  ok: boolean
  ms: number
  error?: string
}

async function check(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  const start = performance.now()
  try {
    await fn()
    return { name, ok: true, ms: Math.round(performance.now() - start) }
  } catch (e) {
    return { name, ok: false, ms: Math.round(performance.now() - start), error: String(e) }
  }
}

async function checkHealth(name: string, url: string): Promise<CheckResult> {
  return check(name, async () => {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(10_000) })
    if (res.status !== 200) throw new Error(`status ${res.status}`)
    const json = (await res.json()) as { status?: string }
    if (json.status !== 'ok') throw new Error(`status field: ${json.status}`)
  })
}

async function runChecks(url: string, api?: string): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // 1. Page load
  results.push(
    await check('page-load', async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (res.status !== 200) throw new Error(`status ${res.status}`)
      const body = await res.text()
      if (!body.includes('<html')) throw new Error('response is not HTML')
    }),
  )

  // 2. Worker health endpoint
  results.push(await checkHealth('worker-health', url))

  // 3. Static asset — extract first script src from HTML and fetch it
  results.push(
    await check('static-asset', async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const html = await res.text()
      const match = html.match(/src="(\/assets\/[^"]+)"/)
      if (!match) throw new Error('no asset reference found in HTML')
      const assetRes = await fetch(`${url}${match[1]}`, { signal: AbortSignal.timeout(10_000) })
      if (assetRes.status !== 200) throw new Error(`asset status ${assetRes.status}`)
      await assetRes.arrayBuffer()
    }),
  )

  // 4. API health (if provided)
  if (api) {
    results.push(await checkHealth('api-health', api))
  }

  return results
}

function printRound(round: number, total: number | null, results: CheckResult[]) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false })
  const label = total ? `Round ${round}/${total}` : `Round ${round}`
  console.log(`\n[${time}] ${label}`)
  for (const r of results) {
    const status = r.ok ? 'OK' : 'FAIL'
    const pad = ' '.repeat(Math.max(0, 16 - r.name.length))
    const line = `  ${r.name}${pad} ${status}  ${r.ms}ms`
    if (r.ok) {
      console.log(line)
    } else {
      console.log(`${line}  ${r.error}`)
    }
  }
}

function allPassed(results: CheckResult[]): boolean {
  return results.every((r) => r.ok)
}

// Main
async function main() {
  console.log(`Canary: ${baseUrl}`)
  if (apiUrl) console.log(`API:    ${apiUrl}`)
  console.log(`Mode:   ${once ? 'single check' : `${duration}s bake, ${interval}s interval`}`)

  if (once) {
    const results = await runChecks(baseUrl!, apiUrl)
    printRound(1, null, results)
    process.exit(allPassed(results) ? 0 : 1)
  }

  const totalRounds = Math.ceil(duration / interval)
  const startTime = Date.now()
  let round = 0
  let lastPassed = false

  while (Date.now() - startTime < duration * 1000) {
    round++
    const results = await runChecks(baseUrl!, apiUrl)
    printRound(round, totalRounds, results)
    lastPassed = allPassed(results)

    const elapsed = Date.now() - startTime
    const remaining = duration * 1000 - elapsed
    if (remaining > interval * 1000) {
      await Bun.sleep(interval * 1000)
    } else if (remaining > 0) {
      await Bun.sleep(remaining)
    }
  }

  // Final round
  round++
  const finalResults = await runChecks(baseUrl!, apiUrl)
  printRound(round, totalRounds, finalResults)
  lastPassed = allPassed(finalResults)

  if (lastPassed) {
    console.log('\nCanary PASSED')
    process.exit(0)
  } else {
    console.log('\nCanary FAILED')
    process.exit(1)
  }
}

main()
