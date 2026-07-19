import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { AUTH_USER_SERVICE, OIDC_PROVIDER, SESSION_TOKEN } from '../auth.tokens'
import type {
  OidcProviderPort,
  OidcTxPayload,
} from '../oidc/oidc-provider.port'
import type {
  SessionPayload,
  SessionTokenPort,
} from '../session/session-token.port'
import type { AuthUserService, OidcClaims } from '../types'

export interface CallbackInput {
  code: string
  state: string
  txToken: string // from tx cookie
}

export interface CallbackResult {
  sessionJwt: string
}

@Injectable()
export class HandleCallbackUseCase {
  constructor(
    @Inject(OIDC_PROVIDER) private readonly oidc: OidcProviderPort,
    @Inject(AUTH_USER_SERVICE)
    private readonly authUserService: AuthUserService,
    @Inject(SESSION_TOKEN) private readonly sessionToken: SessionTokenPort,
  ) {}

  async execute(input: CallbackInput): Promise<CallbackResult> {
    // verify tx cookie and recover PKCE/nonce params
    let txPayload: SessionPayload
    try {
      txPayload = await this.sessionToken.verify(input.txToken)
    } catch {
      throw new UnauthorizedException('Invalid or expired login transaction')
    }

    if (txPayload.sub !== input.state) {
      throw new UnauthorizedException('State mismatch — possible CSRF')
    }

    const tx: OidcTxPayload = {
      state: txPayload.sub,
      nonce: txPayload.email,
      codeVerifier: txPayload.displayName,
    }

    const tokenResult = await this.oidc.exchangeCode(input.code, tx)

    const claims: OidcClaims = {
      sub: tokenResult.sub,
      email: tokenResult.email,
      displayName: tokenResult.displayName,
      idToken: tokenResult.idToken,
      refreshToken: tokenResult.refreshToken,
      pictureUrl: tokenResult.pictureUrl,
    }

    // JIT provisioning + role/season logic lives entirely in the host's AuthUserService
    const sessionUser = await this.authUserService.onLogin(claims)

    const sessionJwt = await this.sessionToken.sign({
      sub: sessionUser.sub,
      email: sessionUser.email,
      displayName: sessionUser.displayName,
      idToken: tokenResult.idToken,
    })

    return { sessionJwt }
  }
}
