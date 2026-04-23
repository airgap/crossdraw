export interface Env {
  ASSETS: Fetcher
  RELEASES: R2Bucket
}

const mimeTypes: Record<string, string> = {
  '.apk': 'application/vnd.android.package-archive',
  '.dmg': 'application/x-apple-diskimage',
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.deb': 'application/vnd.debian.binary-package',
  '.AppImage': 'application/x-executable',
  '.zip': 'application/zip',
}

function getContentType(key: string, r2ContentType?: string): string {
  if (r2ContentType) return r2ContentType
  for (const [ext, mime] of Object.entries(mimeTypes)) {
    if (key.endsWith(ext)) return mime
  }
  return 'application/octet-stream'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Health check — unauthenticated, must precede SPA fallback
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'crossdraw-worker',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        },
      )
    }

    // Serve release binaries from R2
    if (url.pathname.startsWith('/releases/')) {
      const key = url.pathname.slice('/releases/'.length)
      if (!key) return new Response('Not found', { status: 404 })

      const object = await env.RELEASES.get(key)
      if (!object) return new Response('Not found', { status: 404 })

      const contentType = getContentType(key, object.httpMetadata?.contentType)
      const filename = key.split('/').pop() ?? key
      const headers = new Headers({
        'content-type': contentType,
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'public, max-age=3600, no-transform',
        'x-content-type-options': 'nosniff',
        etag: object.httpEtag,
      })
      if (object.size !== undefined) {
        headers.set('content-length', object.size.toString())
      }
      return new Response(object.body, { headers })
    }

    // Try serving static assets; fall back to index.html for SPA routes
    let response = await env.ASSETS.fetch(request)
    if (response.status === 404) {
      // SPA fallback: serve index.html for unknown paths
      response = await env.ASSETS.fetch(new Request(new URL('/', url), request))
    }

    // Allow approved first-parties to embed the editor as an iframe. The
    // default X-Frame-Options=SAMEORIGIN from the asset platform blocks
    // cross-origin framing outright, so we replace it with a frame-ancestors
    // CSP that names the embed partners.
    const ct = response.headers.get('content-type') ?? ''
    if (ct.includes('text/html')) {
      const headers = new Headers(response.headers)
      headers.delete('x-frame-options')
      headers.set(
        'content-security-policy',
        "frame-ancestors 'self' https://lyku.org https://*.lyku.org https://beta.lyku.org",
      )
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return response
  },
} satisfies ExportedHandler<Env>
