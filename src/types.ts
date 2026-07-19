export interface OidcClaims {
  sub: string
  email: string
  displayName: string
  idToken: string
  refreshToken?: string
  pictureUrl?: string
}

export interface SessionUser {
  sub: string
  email: string
  displayName: string
  [key: string]: unknown
}

export interface AuthUserService {
  onLogin(claims: OidcClaims): Promise<SessionUser>
  getMe?(sessionUser: SessionUser): Promise<unknown>
}

export interface AuthModuleOptions {
  oidc: {
    issuer: string
    clientId: string
    clientSecret: string
    redirectUri: string
    scopes?: string
    postLogoutRedirectUri?: string
  }
  jwt: {
    privateKey: string
    publicKey: string
    issuer: string
    audience: string
    accessTtlSeconds?: number
  }
  cookies?: {
    sessionCookieName?: string
    txCookieName?: string
    secure?: boolean
  }
  appBaseUrl: string
  controller?: {
    disabled?: boolean
    prefix?: string
  }
}
