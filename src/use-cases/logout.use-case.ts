import { Inject, Injectable } from '@nestjs/common'
import { OIDC_PROVIDER } from '../auth.tokens'
import type { OidcProviderPort } from '../oidc/oidc-provider.port'

export interface LogoutResult {
  logoutUrl: string
}

@Injectable()
export class LogoutUseCase {
  constructor(@Inject(OIDC_PROVIDER) private readonly oidc: OidcProviderPort) {}

  execute(idToken?: string): LogoutResult {
    return {
      logoutUrl: this.oidc.buildLogoutUrl(idToken),
    }
  }
}
