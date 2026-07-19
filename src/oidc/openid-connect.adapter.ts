import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common'
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  type Configuration,
  calculatePKCECodeChallenge,
  discovery,
  fetchUserInfo,
  refreshTokenGrant,
} from 'openid-client'
import { MODULE_OPTIONS_TOKEN } from '../auth.module-definition'
import type { AuthModuleOptions } from '../types'
import type {
  OidcProviderPort,
  OidcTokenResult,
  OidcTxPayload,
  OidcUserInfoResult,
} from './oidc-provider.port'

@Injectable()
export class OpenIdConnectAdapter implements OidcProviderPort, OnModuleInit {
  private readonly logger = new Logger(OpenIdConnectAdapter.name)
  private config?: Configuration

  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private readonly options: AuthModuleOptions,
  ) {}

  private logOidcStageError(stage: string, error: unknown) {
    const details =
      typeof error === 'object' && error !== null
        ? (error as Record<string, unknown>)
        : {}

    const response =
      typeof details['response'] === 'object' && details['response'] !== null
        ? (details['response'] as Record<string, unknown>)
        : undefined

    const responseBody =
      typeof response?.['body'] === 'string' ? response.body : undefined

    const responsePreview =
      responseBody && responseBody.length > 1000
        ? `${responseBody.slice(0, 1000)}...[truncated]`
        : responseBody

    const cause =
      typeof details['cause'] === 'object' && details['cause'] !== null
        ? (details['cause'] as Record<string, unknown>)
        : undefined

    const causeStatus =
      typeof cause?.['status'] === 'number'
        ? cause.status
        : typeof cause?.['statusCode'] === 'number'
          ? cause.statusCode
          : undefined
    const causeCode =
      typeof cause?.['code'] === 'string' ? cause.code : undefined
    const causeMessage =
      typeof cause?.['message'] === 'string' ? cause.message : undefined
    const causeUrl = typeof cause?.['url'] === 'string' ? cause.url : undefined
    const causeMethod =
      typeof cause?.['method'] === 'string' ? cause.method : undefined
    const causeBody =
      typeof cause?.['body'] === 'string' ? cause.body : undefined
    const causeBodyPreview =
      causeBody && causeBody.length > 1000
        ? `${causeBody.slice(0, 1000)}...[truncated]`
        : causeBody
    const errorCode =
      typeof details['code'] === 'string' || typeof details['code'] === 'number'
        ? String(details['code'])
        : 'n/a'

    this.logger.error(
      [
        `OIDC ${stage} failed`,
        `message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        `name: ${typeof details['name'] === 'string' ? details['name'] : 'Unknown'}`,
        `code: ${errorCode}`,
        `status: ${response?.['statusCode'] ?? response?.['status'] ?? 'n/a'}`,
        `body: ${responsePreview ?? 'n/a'}`,
        `cause.code: ${causeCode ?? 'n/a'}`,
        `cause.status: ${causeStatus ?? 'n/a'}`,
        `cause.method: ${causeMethod ?? 'n/a'}`,
        `cause.url: ${causeUrl ?? 'n/a'}`,
        `cause.message: ${causeMessage ?? 'n/a'}`,
        `cause.body: ${causeBodyPreview ?? 'n/a'}`,
      ].join('\n'),
      error instanceof Error ? error.stack : undefined,
    )
  }

  private async discover(): Promise<Configuration> {
    const { issuer, clientId, clientSecret } = this.options.oidc

    if (!clientId) throw new Error('OIDC not configured')

    this.config = await discovery(new URL(issuer), clientId, clientSecret)
    return this.config
  }

  async onModuleInit() {
    const { clientId } = this.options.oidc

    // ponytail: skip discovery when clientId not configured (no-IdP dev env)
    if (!clientId) return

    try {
      await this.discover()
    } catch (error) {
      this.logger.warn(
        `OIDC discovery failed for ${this.options.oidc.issuer}; auth routes will be unavailable until the IdP is reachable.`,
      )
      this.logger.debug(error)
    }
  }

  private discovering?: Promise<Configuration>

  // ponytail: no backoff — discovery only runs per-request on cache miss; add cooldown if IdP outages hammer logs
  private async ensureConfig(): Promise<Configuration> {
    if (this.config) return this.config
    this.discovering ??= this.discover().finally(() => {
      this.discovering = undefined
    })
    try {
      return await this.discovering
    } catch {
      throw new ServiceUnavailableException(
        'OIDC provider is not configured or discovery is unavailable',
      )
    }
  }

  async buildAuthorizationUrl(tx: OidcTxPayload): Promise<string> {
    const codeChallenge = await calculatePKCECodeChallenge(tx.codeVerifier)
    const { redirectUri, scopes } = this.options.oidc
    const config = await this.ensureConfig()

    const url = buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: scopes ?? 'openid profile email',
      state: tx.state,
      nonce: tx.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    return url.href
  }

  async exchangeCode(
    code: string,
    tx: OidcTxPayload,
  ): Promise<OidcTokenResult> {
    const { redirectUri } = this.options.oidc
    const config = await this.ensureConfig()
    const callbackUrl = new URL(`${redirectUri}?code=${code}&state=${tx.state}`)

    let tokens: Awaited<ReturnType<typeof authorizationCodeGrant>>
    try {
      tokens = await authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: tx.codeVerifier,
        expectedNonce: tx.nonce,
        expectedState: tx.state,
      })
    } catch (error) {
      this.logOidcStageError('token exchange', error)
      throw error
    }

    const claims = tokens.claims()!
    let userinfo: Awaited<ReturnType<typeof fetchUserInfo>>
    try {
      userinfo = await fetchUserInfo(config, tokens.access_token!, claims.sub)
    } catch (error) {
      this.logOidcStageError('userinfo fetch', error)
      throw error
    }

    const displayName =
      (userinfo['name'] as string | undefined) ??
      `${userinfo['given_name'] ?? ''} ${userinfo['family_name'] ?? ''}`.trim()

    return {
      sub: claims.sub,
      email: (userinfo['email'] as string) ?? '',
      displayName,
      idToken: tokens.id_token!,
      refreshToken: tokens.refresh_token,
      pictureUrl: userinfo['picture'] as string | undefined,
    }
  }

  async refreshUserInfo(refreshToken: string): Promise<OidcUserInfoResult> {
    const config = await this.ensureConfig()

    let tokens: Awaited<ReturnType<typeof refreshTokenGrant>>
    try {
      tokens = await refreshTokenGrant(config, refreshToken)
    } catch (error) {
      this.logOidcStageError('refresh token grant', error)
      throw error
    }

    const claims = tokens.claims()!
    let userinfo: Awaited<ReturnType<typeof fetchUserInfo>>
    try {
      userinfo = await fetchUserInfo(config, tokens.access_token!, claims.sub)
    } catch (error) {
      this.logOidcStageError('userinfo fetch (sync-idp)', error)
      throw error
    }

    const displayName =
      (userinfo['name'] as string | undefined) ??
      `${userinfo['given_name'] ?? ''} ${userinfo['family_name'] ?? ''}`.trim()

    return {
      displayName,
      pictureUrl: userinfo['picture'] as string | undefined,
    }
  }

  buildLogoutUrl(idTokenHint?: string): string {
    const { postLogoutRedirectUri } = this.options.oidc
    // ponytail: sync signature per OidcProviderPort — can't await ensureConfig here;
    // logout always follows a completed login so config is already cached by then
    if (!this.config) {
      throw new ServiceUnavailableException(
        'OIDC provider is not configured or discovery is unavailable',
      )
    }
    const url = buildEndSessionUrl(this.config, {
      post_logout_redirect_uri: postLogoutRedirectUri,
      ...(idTokenHint ? { id_token_hint: idTokenHint } : {}),
    })
    return url.href
  }
}
