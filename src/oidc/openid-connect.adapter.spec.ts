import { ServiceUnavailableException } from '@nestjs/common'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { OpenIdConnectAdapter } from './openid-connect.adapter'
import type { AuthModuleOptions } from '../types'

vi.mock('openid-client')

describe('OpenIdConnectAdapter', () => {
  let adapter: OpenIdConnectAdapter
  let mockOptions: AuthModuleOptions

  beforeEach(async () => {
    vi.clearAllMocks()
    mockOptions = {
      oidc: {
        issuer: 'https://example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
      },
      jwt: {
        privateKey: 'test-private-key',
        publicKey: 'test-public-key',
        issuer: 'test-issuer',
        audience: 'test-audience',
      },
      appBaseUrl: 'http://localhost:3000',
    }
  })

  test('onModuleInit succeeds when no clientId configured', async () => {
    const optionsNoClient = { ...mockOptions, oidc: { ...mockOptions.oidc, clientId: '' } }
    adapter = new OpenIdConnectAdapter(optionsNoClient)

    await expect(adapter.onModuleInit()).resolves.toBeUndefined()
  })

  test('onModuleInit does not throw on unreachable issuer', async () => {
    const { discovery } = await import('openid-client')
    vi.mocked(discovery).mockRejectedValueOnce(new Error('Network error'))

    adapter = new OpenIdConnectAdapter(mockOptions)
    await expect(adapter.onModuleInit()).resolves.toBeUndefined()
  })

  test('call after failed discovery rejects ServiceUnavailableException', async () => {
    const { discovery } = await import('openid-client')
    vi.mocked(discovery).mockRejectedValue(new Error('Discovery failed'))

    adapter = new OpenIdConnectAdapter(mockOptions)
    await adapter.onModuleInit()

    const tx = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'test-verifier' }
    await expect(adapter.buildAuthorizationUrl(tx)).rejects.toThrow(ServiceUnavailableException)
  })

  test('lazy retry after failed init succeeds when discovery later resolves', async () => {
    const { discovery, buildAuthorizationUrl, calculatePKCECodeChallenge } = await import('openid-client')
    const mockConfig = {
      issuer: 'https://example.com',
      token_endpoint: 'https://example.com/token',
      authorization_endpoint: 'https://example.com/auth',
      userinfo_endpoint: 'https://example.com/userinfo',
      end_session_endpoint: 'https://example.com/logout',
    }

    let callCount = 0
    vi.mocked(discovery).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('Temporary failure')
      }
      return mockConfig
    })
    
    vi.mocked(calculatePKCECodeChallenge).mockResolvedValue('test-challenge')
    vi.mocked(buildAuthorizationUrl).mockReturnValue(new URL('https://example.com/auth?...'))

    adapter = new OpenIdConnectAdapter(mockOptions)
    await adapter.onModuleInit()

    const tx = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'test-verifier' }
    const url = await adapter.buildAuthorizationUrl(tx)

    expect(url).toBeTruthy()
  })

  test('concurrent calls dedup to one discovery() invocation', async () => {
    const { discovery, buildAuthorizationUrl, calculatePKCECodeChallenge } = await import('openid-client')
    const mockConfig = {
      issuer: 'https://example.com',
      token_endpoint: 'https://example.com/token',
      authorization_endpoint: 'https://example.com/auth',
      userinfo_endpoint: 'https://example.com/userinfo',
      end_session_endpoint: 'https://example.com/logout',
    }

    let discoveryCallCount = 0
    vi.mocked(discovery).mockImplementation(async () => {
      discoveryCallCount++
      await new Promise((resolve) => setTimeout(resolve, 10))
      return mockConfig
    })

    vi.mocked(calculatePKCECodeChallenge).mockResolvedValue('test-challenge')
    vi.mocked(buildAuthorizationUrl).mockReturnValue(new URL('https://example.com/auth?...'))

    adapter = new OpenIdConnectAdapter(mockOptions)

    const tx = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'test-verifier' }

    const [url1, url2, url3] = await Promise.all([
      adapter.buildAuthorizationUrl(tx),
      adapter.buildAuthorizationUrl(tx),
      adapter.buildAuthorizationUrl(tx),
    ])

    expect(url1).toBeTruthy()
    expect(url2).toBeTruthy()
    expect(url3).toBeTruthy()
    expect(discoveryCallCount).toBe(1)
  })
})
