import {
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { MODULE_OPTIONS_TOKEN } from '../auth.module-definition'
import type { AuthModuleOptions, SessionUser } from '../types'
import { BuildLoginUrlUseCase } from '../use-cases/build-login-url.use-case'
import { GetMeUseCase } from '../use-cases/get-me.use-case'
import { HandleCallbackUseCase } from '../use-cases/handle-callback.use-case'
import { LogoutUseCase } from '../use-cases/logout.use-case'
import { AuthGuard, DEFAULT_SESSION_COOKIE } from '../guards/auth.guard'

const DEFAULT_TX_COOKIE = 'sx_oauth_tx'

// ponytail: Nest controller paths can't be dynamic per-instance easily
// (the `@Controller()` decorator path is fixed at class-decoration time).
// Fixed `@Controller('auth')`, `controller.prefix` option is currently a no-op
// documented in the README — swap for a RouterModule-based prefix if a consumer
// ever needs a non-'auth' mount point.
@Controller('auth')
export class AuthController {
  constructor(
    private readonly buildLoginUrl: BuildLoginUrlUseCase,
    private readonly handleCallback: HandleCallbackUseCase,
    private readonly getMe: GetMeUseCase,
    private readonly logout: LogoutUseCase,
    @Inject(MODULE_OPTIONS_TOKEN) private readonly options: AuthModuleOptions,
  ) {}

  private cookieOpts(maxAgeMs: number) {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure:
        this.options.cookies?.secure ?? process.env.NODE_ENV === 'production',
      maxAge: maxAgeMs,
      path: '/',
    }
  }

  private get sessionCookieName() {
    return this.options.cookies?.sessionCookieName ?? DEFAULT_SESSION_COOKIE
  }

  private get txCookieName() {
    return this.options.cookies?.txCookieName ?? DEFAULT_TX_COOKIE
  }

  @Get('login')
  async login(@Res() res: Response): Promise<void> {
    const { authorizeUrl, txToken } = await this.buildLoginUrl.execute()
    res.cookie(this.txCookieName, txToken, this.cookieOpts(5 * 60 * 1000)) // 5 min
    return res.redirect(302, authorizeUrl)
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (error) {
      res.clearCookie(this.txCookieName)
      return res.redirect(302, this.options.appBaseUrl)
    }

    const txToken: string | undefined = req.cookies?.[this.txCookieName]
    if (!txToken) throw new UnauthorizedException('Missing login transaction')

    const { sessionJwt } = await this.handleCallback.execute({
      code,
      state,
      txToken,
    })

    const ttlSeconds = this.options.jwt.accessTtlSeconds ?? 3600
    res.clearCookie(this.txCookieName)
    res.cookie(
      this.sessionCookieName,
      sessionJwt,
      this.cookieOpts(ttlSeconds * 1000),
    )
    return res.redirect(302, this.options.appBaseUrl)
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logoutHandler(@Req() req: Request, @Res() res: Response) {
    const payload = (req as any)['jwtPayload'] as SessionUser | undefined
    const { logoutUrl } = this.logout.execute(
      payload?.idToken as string | undefined,
    )
    res.clearCookie(this.sessionCookieName)
    return res.json({ logoutUrl })
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: Request) {
    const payload = (req as any)['jwtPayload'] as SessionUser
    return this.getMe.execute(payload)
  }
}
