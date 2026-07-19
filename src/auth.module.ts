import { DynamicModule, Module, Provider } from '@nestjs/common'
import { ConfigurableModuleClass } from './auth.module-definition'
import { AUTH_USER_SERVICE, OIDC_PROVIDER, SESSION_TOKEN } from './auth.tokens'
import { AuthController } from './controller/auth.controller'
import { AuthGuard } from './guards/auth.guard'
import { OpenIdConnectAdapter } from './oidc/openid-connect.adapter'
import { JoseSessionTokenService } from './session/jose-session-token.service'
import type { AuthModuleOptions } from './types'
import { BuildLoginUrlUseCase } from './use-cases/build-login-url.use-case'
import { GetMeUseCase } from './use-cases/get-me.use-case'
import { HandleCallbackUseCase } from './use-cases/handle-callback.use-case'
import { LogoutUseCase } from './use-cases/logout.use-case'

const providers = [
  { provide: OIDC_PROVIDER, useClass: OpenIdConnectAdapter },
  { provide: SESSION_TOKEN, useClass: JoseSessionTokenService },
  BuildLoginUrlUseCase,
  HandleCallbackUseCase,
  GetMeUseCase,
  LogoutUseCase,
  AuthGuard,
]

const exportsList = [AuthGuard, SESSION_TOKEN, OIDC_PROVIDER, AUTH_USER_SERVICE]

// ponytail: not extending ConfigurableModuleClass's own `register`/`registerAsync`
// as `forRoot` — that method's generated signature only accepts AuthModuleOptions,
// but AUTH_USER_SERVICE is host-implemented and must arrive as a separate Nest
// Provider (a class/factory), not data baked into options. A distinct static
// `forRoot` that delegates to the generated `register` avoids a static-override
// signature clash.
@Module({})
export class AuthModule extends ConfigurableModuleClass {
  static forRoot(
    options: AuthModuleOptions,
    authUserServiceProvider: Provider,
  ): DynamicModule {
    const base = ConfigurableModuleClass.register(options)
    const userServiceProvider: Provider =
      typeof authUserServiceProvider === 'function'
        ? { provide: AUTH_USER_SERVICE, useClass: authUserServiceProvider }
        : ({
            ...authUserServiceProvider,
            provide: AUTH_USER_SERVICE,
          } as Provider)

    return {
      ...base,
      controllers: options.controller?.disabled ? [] : [AuthController],
      providers: [...(base.providers ?? []), ...providers, userServiceProvider],
      exports: exportsList,
    }
  }
}
