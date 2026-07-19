# @odpc-platform-x/nest-oidc-odpc-x-idp

Reusable NestJS OIDC (authorization-code + PKCE flow) against the ODPCX IdP,
plus a jose RS256 session cookie. Extracted from the Symposium X backend's
`auth` module — generic core only: no roles, no Prisma, no JIT-provisioning
logic. The host app supplies those via one interface.

## Install

```bash
npm install @odpc-platform-x/nest-oidc-odpc-x-idp openid-client jose
```

`@nestjs/common` / `@nestjs/core` are peer dependencies (already in any Nest app).

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

This wires up `GET /auth/login`, `GET /auth/callback`, `POST /auth/logout`,
`GET /auth/me`, and exports `AuthGuard` for use on your own protected routes.
Layer your own `RolesGuard` / `@Roles()` decorator on top — that's
intentionally not part of this package.

## Options

- `controller.disabled: true` — omit the built-in `AuthController` entirely if
  you want to write your own routes against the exported use-cases/guard.
- `controller.prefix` — **currently a no-op.** Nest's `@Controller()` path is
  fixed at class-decoration time, so a per-instance dynamic prefix isn't a
  cheap thing to support (see `// ponytail:` comment in
  `src/controller/auth.controller.ts`). The controller is fixed at `auth`.
  Wrap it in your own `RouterModule` config if you need a different mount
  point.
- `cookies.sessionCookieName` / `cookies.txCookieName` — override cookie names
  (defaults `sx_session` / `sx_oauth_tx`).

## Not included (by design)

- Role/permission guards (`RolesGuard`, `@Roles()`) — layer your own.
- Any persistence (Prisma, etc.) — `AuthUserService.onLogin` is where that goes.
- Season/tenant scoping, JIT role defaults — host concern.

## Publishing (maintainers)

```bash
npm version <patch|minor|major>
git push --tags
```

CI (`.github/workflows/publish.yml`) builds, tests, and publishes to GitHub
Packages (`https://npm.pkg.github.com`) on any `v*` tag push.
