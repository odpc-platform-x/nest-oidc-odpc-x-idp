export interface SessionPayload {
  sub: string
  email: string
  displayName: string
  idToken?: string
}

export interface SessionTokenPort {
  sign(payload: SessionPayload): Promise<string>
  verify(token: string): Promise<SessionPayload>
}
