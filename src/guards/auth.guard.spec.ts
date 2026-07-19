import { generateKeyPairSync } from 'node:crypto'
import { UnauthorizedException } from '@nestjs/common'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { AuthGuard, DEFAULT_SESSION_COOKIE } from './auth.guard'
import { JoseSessionTokenService } from '../session/jose-session-token.service'
import type { SessionTokenPort } from '../session/session-token.port'
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

describe('AuthGuard', () => {
  let guard: AuthGuard
  let sessionTokenService: SessionTokenPort
  let mockExecutionContext: ExecutionContext
  let mockRequest: Partial<Request>
  let options: AuthModuleOptions

  beforeEach(() => {
    const { service, options: opts } = makeService()
    sessionTokenService = service
    options = opts

    mockRequest = {
      cookies: {},
    }

    mockExecutionContext = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest),
      }),
    } as any

    guard = new AuthGuard(sessionTokenService, options)
  })

  test('no cookie throws UnauthorizedException', async () => {
    mockRequest.cookies = {}

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(UnauthorizedException)
  })

  test('invalid token throws UnauthorizedException', async () => {
    mockRequest.cookies = { [DEFAULT_SESSION_COOKIE]: 'invalid-token-xyz' }

    await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(UnauthorizedException)
  })

  test('valid token attaches payload to request', async () => {
    const payload = {
      sub: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
    }

    const token = await sessionTokenService.sign(payload)
    mockRequest.cookies = { [DEFAULT_SESSION_COOKIE]: token }

    const result = await guard.canActivate(mockExecutionContext)

    expect(result).toBe(true)
    expect((mockRequest as any).jwtPayload).toEqual(
      expect.objectContaining({
        sub: 'user-123',
        email: 'user@example.com',
        displayName: 'Test User',
      }),
    )
  })
})
