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

    // Future: /auth/* and /api/* routes go here

    // Serve release binaries from R2
    if (url.pathname.startsWith('/releases/')) {
      const key = url.pathname.slice('/releases/'.length)
      if (!key) return new Response('Not found', { status: 404 })

      const object = await env.RELEASES.get(key)
      if (!object) return new Response('Not found', { status: 404 })

      const headers = new Headers({
        'content-type': getContentType(key, object.httpMetadata?.contentType),
        'content-disposition': `attachment; filename="${key}"`,
        'cache-control': 'public, max-age=3600, no-transform',
        etag: object.httpEtag,
      })
      if (object.size !== undefined) {
        headers.set('content-length', object.size.toString())
      }
      return new Response(object.body, { headers })
    }

    // Try serving static assets; fall back to index.html for SPA routes
    const response = await env.ASSETS.fetch(request)
    if (response.status === 404) {
      // SPA fallback: serve index.html for unknown paths
      return env.ASSETS.fetch(new Request(new URL('/', url), request))
    }
    return response
  },
} satisfies ExportedHandler<Env>
