export interface Env {
  ASSETS: Fetcher
  RELEASES: R2Bucket
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Future: /auth/* and /api/* routes go here

    // Serve release binaries from R2
    if (url.pathname.startsWith('/releases/')) {
      const key = url.pathname.slice('/releases/'.length)
      if (!key) return new Response('Not found', { status: 404 })

      const object = await env.RELEASES.get(key)
      if (!object) return new Response('Not found', { status: 404 })

      return new Response(object.body, {
        headers: {
          'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
          'content-disposition': `attachment; filename="${key}"`,
          'cache-control': 'public, max-age=3600',
          etag: object.httpEtag,
        },
      })
    }

    // Everything else: serve static assets (SPA fallback handled by assets config)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
