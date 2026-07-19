<p align="center">
  <a href="https://idp.odpcx.com"><img src="https://cdn.odpcx.com/public/idp/idp-logo.webp" alt="ODPCX IdP Link" height="72"></a>
  &nbsp;&nbsp;
  <img src="https://cdn.odpcx.com/public/idp/odpcx-logo.webp" alt="ODPC-X Platform" height="72">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/OpenID_Connect-openid--client_v6-F78C40?logo=openid&logoColor=white" alt="OpenID Connect">
  <img src="https://img.shields.io/badge/JWT-jose_RS256-000000?logo=jsonwebtokens&logoColor=white" alt="jose">
  <img src="https://img.shields.io/badge/Vitest-tested-6E9F18?logo=vitest&logoColor=white" alt="Vitest">
</p>

# @odpc-platform-x/nest-oidc-odpc-x-idp

Reusable NestJS OIDC (authorization-code + PKCE flow) against the ODPCX IdP Link,
plus a jose RS256 session cookie. Extracted from the Symposium X backend's
`auth` module — generic core only: no roles, no Prisma, no JIT-provisioning
logic. The host app supplies those via one interface.

## Install

```bash
npm install @odpc-platform-x/nest-oidc-odpc-x-idp openid-client jose
pnpm add @odpc-platform-x/nest-oidc-odpc-x-idp openid-client jose
yarn add @odpc-platform-x/nest-oidc-odpc-x-idp openid-client jose
bun add @odpc-platform-x/nest-oidc-odpc-x-idp openid-client jose
```

Registry scope in `.npmrc` applies to all four package managers; bun >=1.1 reads
`.npmrc` directly, no `bunfig.toml` needed.

`@nestjs/common` / `@nestjs/core` are peer dependencies (already in any Nest app).

## Requirements

- **Node >= 18**
- `openid-client` **v6 only** — v5 class-based API (`Issuer`, `BaseClient`) is incompatible; this package uses v6 functional API (`discovery`, `authorizationCodeGrant`, `fetchUserInfo`).
- `jose` v5 or v6 (peer dependency)
- **Host app must register `cookie-parser` middleware** before any auth routes — `AuthGuard` reads `req.cookies`:

```ts
import cookieParser from 'cookie-parser'
const app = await NestFactory.create(AppModule)
app.use(cookieParser())
// ... rest of setup
```

Without it, every request will 401 because the session cookie won't parse.

- **SPA on different origin?** Enable CORS and fetch with credentials:

```ts
app.enableCors({
  origin: process.env.SPA_ORIGIN,
  credentials: true,
})

// Client-side fetch:
fetch('/auth/login', { credentials: 'include' })
```

## What you implement: `AuthUserService`

```ts
import { AUTH_USER_SERVICE, AuthUserService, OidcClaims, SessionUser } from '@odpc-platform-x/nest-oidc-odpc-x-idp'

@Injectable()
class MyAuthUserService implements AuthUserService {
  constructor(private readonly users: UserRepository) {}

  async onLogin(claims: OidcClaims): Promise<SessionUser> {
    // your own Prisma upsert / JIT role provisioning / season logic goes here
    const user = await this.users.upsertByIdpSub(claims)
    return { sub: user.id, email: user.email, displayName: user.displayName, roles: user.roles }
  }

  // optional — defaults to returning the session payload as-is
  async getMe(sessionUser: SessionUser) {
    return this.users.findWithRoles(sessionUser.sub)
  }
}
```

## Wiring it up

```ts
import { Module } from '@nestjs/common'
import { AuthModule } from '@odpc-platform-x/nest-oidc-odpc-x-idp'

@Module({
  imports: [
    AuthModule.forRoot(
      {
        oidc: {
          issuer: process.env.OIDC_ISSUER!,
          clientId: process.env.OIDC_CLIENT_ID!,
          clientSecret: process.env.OIDC_CLIENT_SECRET!,
          redirectUri: process.env.OIDC_REDIRECT_URI!,
        },
        jwt: {
          privateKey: process.env.JWT_PRIVATE_KEY!,
          publicKey: process.env.JWT_PUBLIC_KEY!,
          issuer: 'my-app',
          audience: 'my-app',
        },
        appBaseUrl: process.env.APP_BASE_URL!,
      },
      MyAuthUserService, // or { provide: AUTH_USER_SERVICE, useFactory: ... }
    ),
  ],
})
export class AppModule {}
```

```dotenv
# Official ODPCX IdP Link (frontend: https://idp.odpcx.com)
OIDC_ISSUER=https://api.idp.odpcx.com
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URI=https://your-app.example.com/v1/auth/callback
```

Discovery document: `https://api.idp.odpcx.com/.well-known/openid-configuration`

This wires up the routes below and exports `AuthGuard` for use on your own protected routes.
Layer your own `RolesGuard` / `@Roles()` decorator on top — that's intentionally not part of this package.

## Route table

| Endpoint | Behavior |
|----------|----------|
| `GET /auth/login` | Redirect (302) to ODPCX IdP authorization endpoint. Sets `sx_oauth_tx` cookie (httpOnly, sameSite=lax, maxAge=5min) containing PKCE state/nonce. Returns 503 JSON if IdP discovery fails. |
| `GET /auth/callback?code&state&error` | **Success**: verify tx cookie + state, exchange code for IdP tokens, call host's `AuthUserService.onLogin()`, sign session JWT, set `sx_session` cookie (httpOnly, sameSite=lax, secure in production, maxAge=accessTtlSeconds), redirect (302) to appBaseUrl. **Error from IdP** (`?error=...`): clear tx cookie, redirect to appBaseUrl. **Invalid tx/state mismatch**: return 401 JSON (no redirect). **onLogin throw**: return 500 JSON. |
| `GET /auth/me` (AuthGuard) | Return JSON: `SessionUser` from the session cookie, or if host supplied `AuthUserService.getMe()`, return its result. Expired/absent session: 401. |
| `POST /auth/logout` (AuthGuard) | Clear `sx_session` cookie, return JSON `{ logoutUrl }`. Client must navigate to `logoutUrl` itself (window.location = logoutUrl); this endpoint doesn't redirect. Stale/expired cookie: 401. 503 if IdP discovery never succeeded this process. |

## Protecting your own routes

Apply `AuthGuard` to any route that needs authentication. The guard attaches the JWT payload to `req.jwtPayload`:

```ts
import { AuthGuard } from '@odpc-platform-x/nest-oidc-odpc-x-idp'

@Controller('api')
export class MyController {
  @UseGuards(AuthGuard)
  @Get('my-data')
  myData(@Req() req: Request) {
    const user = (req as any).jwtPayload as SessionUser
    // user.sub, user.email, user.displayName, etc.
    return { data: 'only for authenticated users' }
  }
}
```

## Session token notes

The session JWT payload contains `sub`, `email`, `displayName` (all from `SessionUser`) plus standard JWT claims (`iss`, `aud`, `iat`, `exp`). The JWT is signed with RS256 and stored in a cookie.

**⚠️ WARNING:** The IdP's `idToken` is embedded in the session cookie payload (for logout flow) but the cookie is **signed, not encrypted** — the payload is readable via base64 decode. Do not include secrets or sensitive data in `SessionUser` that the host's `onLogin()` method returns.

Session expiry: once a JWT expires (based on `accessTtlSeconds`), the cookie is no longer valid. The client must log in again via `GET /auth/login` — there is no refresh token flow. Design your UX so users hit login naturally or add a client-side timer to redirect before expiry.

## Config loading

This package does not support `forRootAsync` — `AuthModule.forRoot()` accepts a plain options object. Load environment variables before calling `forRoot`:

```ts
import * as dotenv from 'dotenv'
dotenv.config()

AuthModule.forRoot(
  {
    oidc: {
      issuer: process.env.OIDC_ISSUER!,
      // ...
    },
    // ...
  },
  MyAuthUserService,
)
```

If you need dependency injection for config (e.g., loading from a ConfigService), use the `useFactory` pattern in the host app's module and inject the configured options there:

```ts
@Module({
  providers: [
    {
      provide: 'AUTH_CONFIG',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        oidc: { issuer: configService.get('OIDC_ISSUER'), ... },
        jwt: { privateKey: configService.get('JWT_PRIVATE_KEY'), ... },
        appBaseUrl: configService.get('APP_BASE_URL'),
      }),
    },
  ],
})
export class AppModule {
  constructor(
    @Inject('AUTH_CONFIG') authConfig: AuthModuleOptions,
    private readonly authUserService: MyAuthUserService,
  ) {
    AuthModule.forRoot(authConfig, this.authUserService)
  }
}
```

## Options

- `controller.disabled: true` — omit the built-in `AuthController` entirely.
  The use-cases (`BuildLoginUrlUseCase`, `HandleCallbackUseCase`, `GetMeUseCase`,
  `LogoutUseCase`) and `AuthGuard` are still provided and exported, so you can
  write your own routes against them (see Protecting your own routes above).
- `controller.prefix` — **currently a no-op.** Nest's `@Controller()` path is
  fixed at class-decoration time, so a per-instance dynamic prefix isn't a
  cheap thing to support (see `// ponytail:` comment in
  `src/controller/auth.controller.ts`). The controller is fixed at `auth`.
  Wrap it in your own `RouterModule` config if you need a different mount
  point.
- `cookies.sessionCookieName` / `cookies.txCookieName` — override cookie names
  (defaults `sx_session` / `sx_oauth_tx`).
- `cookies.secure` — force secure flag on cookies (default: `NODE_ENV === 'production'`)

## Use-cases (controller.disabled mode)

When `controller.disabled: true`, the built-in controller is omitted but you still have access to the underlying use-cases. All four are exported from the package:

```ts
import {
  BuildLoginUrlUseCase,
  HandleCallbackUseCase,
  GetMeUseCase,
  LogoutUseCase,
} from '@odpc-platform-x/nest-oidc-odpc-x-idp'
```

Inject them into your own controller and wire them as needed. See [Protecting your own routes](#protecting-your-own-routes) above for an example.

## Not included (by design)

- Role/permission guards (`RolesGuard`, `@Roles()`) — layer your own.
- Any persistence (Prisma, etc.) — `AuthUserService.onLogin` is where that goes.
- Season/tenant scoping, JIT role defaults — host concern.
- **forRootAsync** — options must be a plain object; see [Config loading](#config-loading) for dependency-injection patterns.

## Publishing (maintainers)

```bash
npm version <patch|minor|major>
git push --tags
```

CI (`.github/workflows/publish.yml`) builds, tests, and publishes to GitHub
Packages (`https://npm.pkg.github.com`) on any `v*` tag push.

---

<p align="center"><sub>ODPC-X-Platform : สำนักงานป้องกันควบคุมโรคที่ 10 จังหวัดอุบลราชธานี</sub></p>
