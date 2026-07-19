import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { MODULE_OPTIONS_TOKEN } from '../auth.module-definition'
import { SESSION_TOKEN } from '../auth.tokens'
import type { SessionTokenPort } from '../session/session-token.port'
import type { AuthModuleOptions } from '../types'

export const DEFAULT_SESSION_COOKIE = 'sx_session'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SESSION_TOKEN) private readonly sessionToken: SessionTokenPort,
    @Inject(MODULE_OPTIONS_TOKEN) private readonly options: AuthModuleOptions,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>()
    const cookieName =
      this.options.cookies?.sessionCookieName ?? DEFAULT_SESSION_COOKIE
    const token: string | undefined = req.cookies?.[cookieName]
    if (!token) throw new UnauthorizedException('No session cookie')

    try {
      const payload = await this.sessionToken.verify(token)
      // req.jwtPayload consumed by @JwtUser-style decorator in the host app
      ;(req as any)['jwtPayload'] = payload
      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired session')
    }
  }
}
