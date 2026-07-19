import { Inject, Injectable } from '@nestjs/common'
import { AUTH_USER_SERVICE } from '../auth.tokens'
import type { AuthUserService, SessionUser } from '../types'

@Injectable()
export class GetMeUseCase {
  constructor(
    @Inject(AUTH_USER_SERVICE)
    private readonly authUserService: AuthUserService,
  ) {}

  async execute(sessionUser: SessionUser): Promise<unknown> {
    if (this.authUserService.getMe) {
      return this.authUserService.getMe(sessionUser)
    }
    return sessionUser
  }
}
