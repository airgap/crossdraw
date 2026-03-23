/**
 * Server-side JWT validation and auth middleware.
 *
 * Supports two auth modes:
 * 1. JWT tokens (from Lyku OAuth) — validated via JWKS public key
 * 2. API key (legacy/CI) — validated via CROSSDRAW_API_KEY env var
 *
 * @module server/auth
 */

// ── Types ──

export interface AuthenticatedUser {
  id: string
  email?: string
  name?: string
}

export type AuthResult = { authenticated: true; user: AuthenticatedUser } | { authenticated: false; error: string }

// ── Configuration ──

const API_KEY = process.env['CROSSDRAW_API_KEY'] ?? ''
const JWKS_URL = process.env['CROSSDRAW_JWKS_URL'] ?? 'https://api.lyku.org/.well-known/jwks.json'
const JWT_ISSUER = process.env['CROSSDRAW_JWT_ISSUER'] ?? 'https://lyku.org'
const JWT_AUDIENCE = process.env['CROSSDRAW_JWT_AUDIENCE'] ?? 'crossdraw'

// ── JWKS cache ──

interface JWK {
  kty: string
  kid: string
  use?: string
  alg?: string
  n?: string // RSA modulus
  e?: string // RSA exponent
  crv?: string // EC curve
  x?: string // EC x
  y?: string // EC y
}

interface JWKSResponse {
  keys: JWK[]
}

let cachedJWKS: JWKSResponse | null = null
let jwksCachedAt = 0
const JWKS_CACHE_TTL = 3600_000 // 1 hour

async function fetchJWKS(): Promise<JWKSResponse> {
  const now = Date.now()
  if (cachedJWKS && now - jwksCachedAt < JWKS_CACHE_TTL) {
    return cachedJWKS
  }

  try {
    const response = await fetch(JWKS_URL)
    if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`)
    cachedJWKS = (await response.json()) as JWKSResponse
    jwksCachedAt = now
    return cachedJWKS
  } catch (err) {
    if (cachedJWKS) return cachedJWKS // Use stale cache on error
    throw err
  }
}

// ── JWT decoding (no verification — used for header parsing) ──

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (str.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function decodeJWTParts(token: string): { header: any; payload: any; signatureInput: string; signature: Uint8Array } {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]!)))
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]!)))
  const signatureInput = `${parts[0]}.${parts[1]}`
  const signature = base64UrlDecode(parts[2]!)

  return { header, payload, signatureInput, signature }
}

// ── JWT verification via Web Crypto ──

async function importJWKAsKey(jwk: JWK): Promise<CryptoKey> {
  if (jwk.kty === 'RSA') {
    return crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  }
  if (jwk.kty === 'EC') {
    return crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      { name: 'ECDSA', namedCurve: jwk.crv ?? 'P-256' },
      false,
      ['verify'],
    )
  }
  throw new Error(`Unsupported key type: ${jwk.kty}`)
}

function getAlgorithm(jwk: JWK): AlgorithmIdentifier | RsaPssParams | EcdsaParams {
  if (jwk.kty === 'RSA') {
    return { name: 'RSASSA-PKCS1-v1_5' }
  }
  return { name: 'ECDSA', hash: 'SHA-256' }
}

// ── Core validation ──

export async function validateJWT(token: string): Promise<AuthResult> {
  try {
    const { header, payload, signatureInput, signature } = decodeJWTParts(token)

    // Find matching key
    const jwks = await fetchJWKS()
    const kid = header.kid
    const jwk = kid ? jwks.keys.find((k) => k.kid === kid) : jwks.keys[0]

    if (!jwk) {
      return { authenticated: false, error: 'No matching JWK found' }
    }

    // Verify signature
    const key = await importJWKAsKey(jwk)
    const algorithm = getAlgorithm(jwk)
    const encoder = new TextEncoder()
    const valid = await crypto.subtle.verify(algorithm, key, signature, encoder.encode(signatureInput))

    if (!valid) {
      return { authenticated: false, error: 'Invalid JWT signature' }
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return { authenticated: false, error: 'Token expired' }
    }

    // Check not-before
    if (payload.nbf && payload.nbf > now + 30) {
      return { authenticated: false, error: 'Token not yet valid' }
    }

    // Check issuer
    if (JWT_ISSUER && payload.iss && payload.iss !== JWT_ISSUER) {
      return { authenticated: false, error: 'Invalid issuer' }
    }

    // Check audience
    if (JWT_AUDIENCE && payload.aud) {
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
      if (!audiences.includes(JWT_AUDIENCE)) {
        return { authenticated: false, error: 'Invalid audience' }
      }
    }

    // Extract user
    const user: AuthenticatedUser = {
      id: payload.sub ?? payload.user_id ?? '',
      email: payload.email,
      name: payload.name ?? payload.display_name,
    }

    if (!user.id) {
      return { authenticated: false, error: 'No subject in token' }
    }

    return { authenticated: true, user }
  } catch (err) {
    return { authenticated: false, error: `JWT validation error: ${err}` }
  }
}

// ── Auth middleware ──

/**
 * Authenticate a request. Checks Bearer token first, falls back to API key.
 * Returns the authenticated user or an error.
 */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
  // Try Bearer token (JWT)
  const authHeader = req.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    return validateJWT(token)
  }

  // Try API key (legacy/CI)
  const apiKeyHeader = req.headers.get('X-API-Key')
  if (apiKeyHeader && API_KEY && apiKeyHeader === API_KEY) {
    return {
      authenticated: true,
      user: { id: '__api-key__', name: 'API Key' },
    }
  }

  // No auth provided — in dev mode (no API key configured), allow anonymous
  if (!API_KEY) {
    return {
      authenticated: true,
      user: { id: '__anonymous__', name: 'Anonymous' },
    }
  }

  return { authenticated: false, error: 'No authentication provided' }
}

/**
 * Extract JWT from a WebSocket upgrade URL query string.
 * Expected format: ?token=<jwt>&room=<roomId>&client=<clientId>
 */
export async function authenticateWebSocket(url: URL): Promise<AuthResult> {
  const token = url.searchParams.get('token')

  if (token) {
    return validateJWT(token)
  }

  // No token — allow anonymous in dev mode
  if (!API_KEY) {
    const clientId = url.searchParams.get('client') ?? 'anonymous'
    return {
      authenticated: true,
      user: { id: clientId, name: `Guest-${clientId.slice(0, 6)}` },
    }
  }

  return { authenticated: false, error: 'No authentication token in WebSocket URL' }
}
