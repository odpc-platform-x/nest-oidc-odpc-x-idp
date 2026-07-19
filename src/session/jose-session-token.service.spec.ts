import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import { JoseSessionTokenService } from './jose-session-token.service'
import type { AuthModuleOptions } from '../types'

function makeService(ttl: number = 3600) {
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
      accessTtlSeconds: ttl,
    },
    appBaseUrl: 'http://localhost',
  }

  return new JoseSessionTokenService(options)
}

describe('JoseSessionTokenService', () => {
  test('sign/verify round-trip', async () => {
    const service = makeService()

    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
    }

    const token = await service.sign(payload)
    const verified = await service.verify(token)

    expect(verified.sub).toBe('user-123')
    expect(verified.email).toBe('test@example.com')
    expect(verified.displayName).toBe('Test User')
  })

  test('expired token rejected', async () => {
    const service = makeService(-1)

    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
    }

    const token = await service.sign(payload)

    // Verify should fail because token is already expired
    await expect(service.verify(token)).rejects.toThrow()
  })

  test('tampered signature rejected', async () => {
    const service = makeService()

    const payload = {
      sub: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
    }

    let validToken = await service.sign(payload)

    // Tamper with the signature by appending random characters
    const tokenParts = validToken.split('.')
    tokenParts[2] = 'tamperedSignature123456'
    const tamperedToken = tokenParts.join('.')

    // Try to verify - should fail
    await expect(service.verify(tamperedToken)).rejects.toThrow()
  })
})
