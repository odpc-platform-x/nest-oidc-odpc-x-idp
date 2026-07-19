import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, test } from 'vitest'
import { AuthModule } from './auth.module'
import { AuthGuard } from './guards/auth.guard'
import { SESSION_TOKEN, OIDC_PROVIDER } from './auth.tokens'
import type { AuthModuleOptions, AuthUserService } from './types'

describe('AuthModule', () => {
  let moduleOptions: AuthModuleOptions

  beforeEach(() => {
    moduleOptions = {
      oidc: {
        issuer: 'https://example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
      },
      jwt: {
        privateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        publicKey: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
        issuer: 'test-iss',
        audience: 'test-aud',
      },
      appBaseUrl: 'http://localhost:3000',
    }
  })

  test('forRoot wires providers with controller disabled', async () => {
    const mockAuthUserService: AuthUserService = {
      onLogin: async () => ({
        sub: 'test',
        email: 'test@example.com',
        displayName: 'Test',
      }),
    }

    const disabledOptions: AuthModuleOptions = {
      ...moduleOptions,
      controller: { disabled: true },
    }

    const testingModule = await Test.createTestingModule({
      imports: [AuthModule.forRoot(disabledOptions, { provide: 'AuthUserService', useValue: mockAuthUserService })],
    }).compile()

    expect(testingModule.get(AuthGuard)).toBeDefined()
    expect(testingModule.get(SESSION_TOKEN)).toBeDefined()
    expect(testingModule.get(OIDC_PROVIDER)).toBeDefined()
  })

  test('controller.disabled omits AuthController', async () => {
    const mockAuthUserService: AuthUserService = {
      onLogin: async () => ({
        sub: 'test',
        email: 'test@example.com',
        displayName: 'Test',
      }),
    }

    const optionsWithDisabledController: AuthModuleOptions = {
      ...moduleOptions,
      controller: { disabled: true },
    }

    const module = AuthModule.forRoot(optionsWithDisabledController, { provide: 'AuthUserService', useValue: mockAuthUserService })

    expect(module.controllers).toEqual([])
  })
})
