import { randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { OIDC_PROVIDER, SESSION_TOKEN } from '../auth.tokens'
import type {
  OidcProviderPort,
  OidcTxPayload,
} from '../oidc/oidc-provider.port'
import type { SessionTokenPort } from '../session/session-token.port'

export interface LoginUrlResult {
  authorizeUrl: string
  txToken: string // short-lived jose JWT sealing state/nonce/codeVerifier
}

@Injectable()
export class BuildLoginUrlUseCase {
  constructor(
    @Inject(OIDC_PROVIDER) private readonly oidc: OidcProviderPort,
    @Inject(SESSION_TOKEN) private readonly sessionToken: SessionTokenPort,
  ) {}

  async execute(): Promise<LoginUrlResult> {
    const tx: OidcTxPayload = {
      state: randomBytes(16).toString('hex'),
      nonce: randomBytes(16).toString('hex'),
      codeVerifier: randomBytes(32).toString('base64url'),
    }

    const [authorizeUrl, txToken] = await Promise.all([
      this.oidc.buildAuthorizationUrl(tx),
      // ponytail: reuse session token port for tx cookie (same RS256 key, ~5 min TTL handled by port impl)
      this.sessionToken.sign({
        sub: tx.state,
        email: tx.nonce,
        displayName: tx.codeVerifier,
      }),
    ])

    return { authorizeUrl, txToken }
  }
}
