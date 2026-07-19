export interface OidcTokenResult {
  sub: string
  email: string
  displayName: string
  idToken: string
  refreshToken?: string
  pictureUrl?: string
}

export interface OidcUserInfoResult {
  displayName: string
  pictureUrl?: string
}

export interface OidcTxPayload {
  state: string
  nonce: string
  codeVerifier: string
}

export interface OidcProviderPort {
  buildAuthorizationUrl(tx: OidcTxPayload): Promise<string>
  exchangeCode(code: string, tx: OidcTxPayload): Promise<OidcTokenResult>
  buildLogoutUrl(idTokenHint?: string): string
  refreshUserInfo(refreshToken: string): Promise<OidcUserInfoResult>
}
