/**
 * Live-updating Designer project status dashboard.
 * Pulls from Linear API and serves a cyberpunk dashboard.
 *
 * Usage:
 *   LINEAR_API_KEY=lin_api_xxx bun run statuspage/server.ts
 */

const LINEAR_API_KEY = process.env.LINEAR_API_KEY ?? ''
const PORT = Number(process.env.PORT ?? 4444)
const TEAM_KEY = 'LYK'
const PROJECT_NAME = 'Crossdraw'
const POLL_INTERVAL = 10_000 // 10s

if (!LINEAR_API_KEY) {
  console.error('ERROR: Set LINEAR_API_KEY environment variable')
  console.error('  LINEAR_API_KEY=lin_api_xxx bun run statuspage/server.ts')
  process.exit(1)
}

interface LinearIssue {
  id: string
  identifier: string
  title: string
  priority: number
  state: { name: string; type: string; color: string }
  labels: { nodes: { name: string; color: string }[] }
  updatedAt: string
  createdAt: string
  url: string
}

interface DashboardState {
  issues: LinearIssue[]
  lastUpdated: string
  stats: {
    total: number
    done: number
    inProgress: number
    backlog: number
    cancelled: number
    triage: number
  }
}

let state: DashboardState = {
  issues: [],
  lastUpdated: new Date().toISOString(),
  stats: { total: 0, done: 0, inProgress: 0, backlog: 0, cancelled: 0, triage: 0 },
}

// SSE clients
const clients = new Set<ReadableStreamDefaultController>()

async function fetchIssues(): Promise<LinearIssue[]> {
  const query = `
    query {
      issues(
        filter: {
          team: { key: { eq: "${TEAM_KEY}" } }
          project: { name: { eq: "${PROJECT_NAME}" } }
        }
        first: 250
        orderBy: updatedAt
      ) {
        nodes {
          id
          identifier
          title
          priority
          url
          updatedAt
          createdAt
          state { name type color }
          labels { nodes { name color } }
        }
      }
    }
  `

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) {
    console.error(`Linear API error: ${res.status} ${res.statusText}`)
    return state.issues
  }

  const json = (await res.json()) as any
  return json.data?.issues?.nodes ?? []
}

function computeStats(issues: LinearIssue[]) {
  const stats = { total: issues.length, done: 0, inProgress: 0, backlog: 0, cancelled: 0, triage: 0 }
  for (const issue of issues) {
    const type = issue.state.type
    if (type === 'completed') stats.done++
    else if (type === 'started') stats.inProgress++
    else if (type === 'backlog' || type === 'unstarted') stats.backlog++
    else if (type === 'cancelled') stats.cancelled++
    else if (type === 'triage') stats.triage++
  }
  return stats
}

async function poll() {
  try {
    const issues = await fetchIssues()
    const stats = computeStats(issues)
    state = { issues, lastUpdated: new Date().toISOString(), stats }

    // Broadcast to SSE clients
    const msg = `data: ${JSON.stringify(state)}\n\n`
    for (const controller of clients) {
      try {
        controller.enqueue(new TextEncoder().encode(msg))
      } catch {
        clients.delete(controller)
      }
    }
  } catch (e) {
    console.error('Poll error:', e)
  }
}

// Start polling
poll()
setInterval(poll, POLL_INTERVAL)

const HTML = await Bun.file(new URL('./dashboard.html', import.meta.url).pathname).text()

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/events') {
      const stream = new ReadableStream({
        start(controller) {
          clients.add(controller)
          // Send current state immediately
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(state)}\n\n`),
          )
        },
        cancel(controller) {
          clients.delete(controller)
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    if (url.pathname === '/api/state') {
      return Response.json(state)
    }

    return new Response(HTML, {
      headers: { 'Content-Type': 'text/html' },
    })
  },
})

console.log(`\n🔥 Dashboard live at http://localhost:${PORT}\n`)
