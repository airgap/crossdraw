/**
 * OAuth 2.0 client for Lyku identity provider.
 *
 * Flow: Authorization Code with PKCE
 * 1. Generate code_verifier + code_challenge
 * 2. Redirect to Lyku /authorize
 * 3. Receive callback with authorization code
 * 4. Exchange code for JWT access_token + refresh_token
 * 5. Store tokens in localStorage
 *
 * @module auth/auth
 */

// ── Types ──

export interface AuthUser {
  id: string
  displayName: string
  email: string
  avatarUrl: string | null
}

export interface AuthSession {
  user: AuthUser
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

export interface AuthConfig {
  /** Lyku OAuth authorize URL (e.g. https://lyku.app/oauth/authorize) */
  authorizeUrl: string
  /** Lyku token endpoint (e.g. https://lyku.app/oauth/token) */
  tokenUrl: string
  /** Lyku userinfo endpoint (e.g. https://lyku.app/api/me) */
  userinfoUrl: string
  /** OAuth client ID registered with Lyku */
  clientId: string
  /** Redirect URI (e.g. http://localhost:5173/auth/callback) */
  redirectUri: string
  /** OAuth scopes */
  scopes: string[]
}

// ── Storage ──

const STORAGE_KEY = 'crossdraw:auth-session'
const VERIFIER_KEY = 'crossdraw:auth-verifier'
const CONFIG_KEY = 'crossdraw:auth-config'

// ── Default config ──

const DEFAULT_CONFIG: AuthConfig = {
  authorizeUrl: 'https://lyku.app/oauth/authorize',
  tokenUrl: 'https://lyku.app/oauth/token',
  userinfoUrl: 'https://lyku.app/api/me',
  clientId: 'crossdraw',
  redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '',
  scopes: ['openid', 'profile', 'email'],
}

let config: AuthConfig = DEFAULT_CONFIG

/** Load saved config overrides from localStorage. */
function loadConfig(): AuthConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return DEFAULT_CONFIG
}

config = loadConfig()

export function getAuthConfig(): AuthConfig {
  return config
}

export function setAuthConfig(overrides: Partial<AuthConfig>): void {
  config = { ...config, ...overrides }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(overrides))
    } catch {
      /* ignore */
    }
  }
}

// ── PKCE helpers ──

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

function base64UrlEncode(buffer: Uint8Array): string {
  let binary = ''
  for (const byte of buffer) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── Session state ──

let currentSession: AuthSession | null = null

function loadSession(): AuthSession | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as AuthSession
    // Check if expired (with 60s buffer)
    if (session.expiresAt < Date.now() + 60_000) {
      // Token expired — caller should try refresh
      return session
    }
    return session
  } catch {
    return null
  }
}

function saveSession(session: AuthSession | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

currentSession = loadSession()

// ── Public API ──

/** Get the current authenticated session, or null if not logged in. */
export function getSession(): AuthSession | null {
  return currentSession
}

/** Get the current user, or null if not logged in. */
export function getCurrentUser(): AuthUser | null {
  return currentSession?.user ?? null
}

/** Get the current access token, or null. */
export function getAccessToken(): string | null {
  return currentSession?.accessToken ?? null
}

/** Check if the user is currently authenticated. */
export function isAuthenticated(): boolean {
  return currentSession !== null && currentSession.expiresAt > Date.now()
}

/**
 * Initiate the OAuth login flow.
 * Redirects the browser to the Lyku authorization page.
 */
export async function login(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)

  // Store verifier for the callback
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(VERIFIER_KEY, verifier)
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: crypto.randomUUID(),
  })

  window.location.href = `${config.authorizeUrl}?${params.toString()}`
}

/**
 * Handle the OAuth callback.
 * Call this when the user is redirected back with an authorization code.
 */
export async function handleCallback(code: string): Promise<AuthSession> {
  const verifier = typeof localStorage !== 'undefined' ? localStorage.getItem(VERIFIER_KEY) : null
  if (!verifier) throw new Error('Missing PKCE verifier — login flow was not started')

  // Exchange code for tokens
  const tokenResponse = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: verifier,
    }),
  })

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text()
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${body}`)
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
  }

  // Clean up verifier
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(VERIFIER_KEY)
  }

  // Fetch user info
  const user = await fetchUserInfo(tokenData.access_token)

  const session: AuthSession = {
    user,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  }

  currentSession = session
  saveSession(session)
  window.dispatchEvent(new Event('crossdraw:auth-changed'))
  return session
}

/** Refresh the access token using the refresh token. */
export async function refreshToken(): Promise<AuthSession | null> {
  if (!currentSession?.refreshToken) return null

  try {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentSession.refreshToken,
        client_id: config.clientId,
      }),
    })

    if (!response.ok) {
      // Refresh failed — user needs to re-login
      logout()
      return null
    }

    const tokenData = (await response.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    const user = await fetchUserInfo(tokenData.access_token)

    const session: AuthSession = {
      user,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    }

    currentSession = session
    saveSession(session)
    window.dispatchEvent(new Event('crossdraw:auth-changed'))
    return session
  } catch {
    return null
  }
}

/**
 * Ensure we have a valid access token.
 * Refreshes if expired. Returns null if unable to authenticate.
 */
export async function ensureValidToken(): Promise<string | null> {
  if (!currentSession) return null
  if (currentSession.expiresAt > Date.now() + 60_000) {
    return currentSession.accessToken
  }
  const refreshed = await refreshToken()
  return refreshed?.accessToken ?? null
}

/** Log out: clear session and notify listeners. */
export function logout(): void {
  currentSession = null
  saveSession(null)
  window.dispatchEvent(new Event('crossdraw:auth-changed'))
}

/** Fetch user info from the Lyku userinfo endpoint. */
async function fetchUserInfo(accessToken: string): Promise<AuthUser> {
  const response = await fetch(config.userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`)
  }

  const data = (await response.json()) as {
    id?: string
    sub?: string
    name?: string
    display_name?: string
    email?: string
    avatar_url?: string
    picture?: string
  }

  return {
    id: data.id ?? data.sub ?? '',
    displayName: data.display_name ?? data.name ?? 'Unknown',
    email: data.email ?? '',
    avatarUrl: data.avatar_url ?? data.picture ?? null,
  }
}
