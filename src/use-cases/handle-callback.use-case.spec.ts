import { generateKeyPairSync } from 'node:crypto'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { HandleCallbackUseCase } from './handle-callback.use-case'
import { JoseSessionTokenService } from '../session/jose-session-token.service'
import type { OidcProviderPort, OidcTokenResult } from '../oidc/oidc-provider.port'
import type { SessionTokenPort } from '../session/session-token.port'
import type { AuthUserService, SessionUser } from '../types'
import type { AuthModuleOptions } from '../types'

function makeService() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })

  const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }) as string
  const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }) as string

  const options: AuthModuleOptions = {
    oidc: {
      issuer: 'https://example.com',
      clientId: 'test',
      clientSecret: 'secret',
      redirectUri: 'http://localhost/callback',
    },
    jwt: {
      privateKey: privateKeyPem,
      publicKey: publicKeyPem,
      issuer: 'test-iss',
      audience: 'test-aud',
      accessTtlSeconds: 3600,
    },
    appBaseUrl: 'http://localhost',
  }

  return { service: new JoseSessionTokenService(options), options }
}

describe('HandleCallbackUseCase', () => {
  let useCase: HandleCallbackUseCase
  let sessionTokenService: SessionTokenPort
  let oidcProvider: OidcProviderPort
  let authUserService: AuthUserService

  beforeEach(() => {
    const { service } = makeService()
    sessionTokenService = service

    oidcProvider = {
      buildAuthorizationUrl: vi.fn(),
      exchangeCode: vi.fn(),
      buildLogoutUrl: vi.fn(),
      refreshUserInfo: vi.fn(),
    }

    authUserService = {
      onLogin: vi.fn(),
    }

    useCase = new HandleCallbackUseCase(
      oidcProvider,
      authUserService,
      sessionTokenService,
    )
  })

  test('onLogin called with claims from token exchange', async () => {
    const state = 'test-state-abc'
    const nonce = 'test-nonce-xyz'
    const codeVerifier = 'test-verifier-123'

    const txToken = await sessionTokenService.sign({
      sub: state,
      email: nonce,
      displayName: codeVerifier,
    })

    const tokenResult: OidcTokenResult = {
      sub: 'oidc-sub-123',
      email: 'user@example.com',
      displayName: 'Test User',
      idToken: 'id-token-123',
      refreshToken: 'refresh-token-123',
      pictureUrl: 'https://example.com/pic.jpg',
    }

    vi.mocked(oidcProvider.exchangeCode).mockResolvedValueOnce(tokenResult)

    const sessionUser: SessionUser = {
      sub: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
    }

    vi.mocked(authUserService.onLogin).mockResolvedValueOnce(sessionUser)

    const result = await useCase.execute({
      code: 'auth-code-123',
      state,
      txToken,
    })

    expect(vi.mocked(authUserService.onLogin)).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'oidc-sub-123',
        email: 'user@example.com',
        displayName: 'Test User',
        idToken: 'id-token-123',
      }),
    )

    expect(result.sessionJwt).toBeTruthy()
  })

  test('returned SessionUser signed as-is', async () => {
    const state = 'test-state-xyz'
    const nonce = 'test-nonce-abc'
    const codeVerifier = 'test-verifier-456'

    const txToken = await sessionTokenService.sign({
      sub: state,
      email: nonce,
      displayName: codeVerifier,
    })

    const tokenResult: OidcTokenResult = {
      sub: 'oidc-sub-456',
      email: 'user@example.com',
      displayName: 'Test User',
      idToken: 'id-token-456',
    }

    vi.mocked(oidcProvider.exchangeCode).mockResolvedValueOnce(tokenResult)

    const sessionUser: SessionUser = {
      sub: 'local-user-456',
      email: 'user@example.com',
      displayName: 'Test User',
    }

    vi.mocked(authUserService.onLogin).mockResolvedValueOnce(sessionUser)

    const result = await useCase.execute({
      code: 'auth-code-456',
      state,
      txToken,
    })

    const verified = await sessionTokenService.verify(result.sessionJwt)

    expect(verified.sub).toBe('local-user-456')
    expect(verified.email).toBe('user@example.com')
    expect(verified.displayName).toBe('Test User')
  })

  test('onLogin rejection propagates', async () => {
    const state = 'test-state-fail'
    const nonce = 'test-nonce-fail'
    const codeVerifier = 'test-verifier-fail'

    const txToken = await sessionTokenService.sign({
      sub: state,
      email: nonce,
      displayName: codeVerifier,
    })

    const tokenResult: OidcTokenResult = {
      sub: 'oidc-sub-fail',
      email: 'user@example.com',
      displayName: 'Test User',
      idToken: 'id-token-fail',
    }

    vi.mocked(oidcProvider.exchangeCode).mockResolvedValueOnce(tokenResult)

    const error = new Error('User provisioning failed')
    vi.mocked(authUserService.onLogin).mockRejectedValueOnce(error)

    await expect(
      useCase.execute({
        code: 'auth-code-fail',
        state,
        txToken,
      }),
    ).rejects.toThrow('User provisioning failed')
  })
})
