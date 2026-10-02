import { describe, expect, test, vi } from 'vitest'
import { AuthController } from './auth.controller'

describe('AuthController callback', () => {
  test('?error redirects to appBaseUrl carrying the IdP error and clears the tx cookie', async () => {
    const controller = new AuthController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { appBaseUrl: 'https://app.test/home?x=1' } as any,
    )
    const res = { clearCookie: vi.fn(), redirect: vi.fn() }

    await controller.callback(
      undefined as any,
      undefined as any,
      'access_denied',
      'User denied',
      {} as any,
      res as any,
    )

    expect(res.clearCookie).toHaveBeenCalledWith('sx_oauth_tx')
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://app.test/home?x=1&error=access_denied&error_description=User+denied',
    )
  })
})
