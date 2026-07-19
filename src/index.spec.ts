import { describe, expect, test } from 'vitest'
import * as pkg from './index'

describe('package public API', () => {
  test('exposes exactly the documented exports', () => {
    const expected = [
      'AuthModule',
      'AuthGuard',
      'AUTH_USER_SERVICE',
      'DEFAULT_SESSION_COOKIE',
      'BuildLoginUrlUseCase',
      'HandleCallbackUseCase',
      'GetMeUseCase',
      'LogoutUseCase',
    ].sort()

    expect(Object.keys(pkg).sort()).toEqual(expected)
  })

  test('each exported use-case is a class', () => {
    expect(typeof pkg.BuildLoginUrlUseCase).toBe('function')
    expect(typeof pkg.HandleCallbackUseCase).toBe('function')
    expect(typeof pkg.GetMeUseCase).toBe('function')
    expect(typeof pkg.LogoutUseCase).toBe('function')
  })
})
