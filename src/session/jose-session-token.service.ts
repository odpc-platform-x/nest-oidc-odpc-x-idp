import { Inject, Injectable } from '@nestjs/common'
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import { MODULE_OPTIONS_TOKEN } from '../auth.module-definition'
import type { AuthModuleOptions } from '../types'
import type { SessionPayload, SessionTokenPort } from './session-token.port'

const DEFAULT_ACCESS_TTL_SECONDS = 3600

@Injectable()
export class JoseSessionTokenService implements SessionTokenPort {
  // ponytail: lazy-memoized — keys are static config, parsing once per process is enough
  private cachedPrivateKey?: Promise<CryptoKey>
  private cachedPublicKey?: Promise<CryptoKey>

  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private readonly options: AuthModuleOptions,
  ) {}

  private getPrivateKey(): Promise<CryptoKey> {
    this.cachedPrivateKey ??= importPKCS8(this.options.jwt.privateKey, 'RS256')
    return this.cachedPrivateKey
  }

  private getPublicKey(): Promise<CryptoKey> {
    this.cachedPublicKey ??= importSPKI(this.options.jwt.publicKey, 'RS256')
    return this.cachedPublicKey
  }

  async sign(payload: SessionPayload): Promise<string> {
    const privateKey = await this.getPrivateKey()
    const ttl = this.options.jwt.accessTtlSeconds ?? DEFAULT_ACCESS_TTL_SECONDS

    return new SignJWT({
      email: payload.email,
      displayName: payload.displayName,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(payload.sub)
      .setIssuer(this.options.jwt.issuer)
      .setAudience(this.options.jwt.audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(privateKey)
  }

  async verify(token: string): Promise<SessionPayload> {
    const publicKey = await this.getPublicKey()

    const { payload } = await jwtVerify(token, publicKey, {
      issuer: this.options.jwt.issuer,
      audience: this.options.jwt.audience,
      algorithms: ['RS256'],
    })

    return {
      sub: payload.sub!,
      email: payload['email'] as string,
      displayName: payload['displayName'] as string,
    }
  }
}
