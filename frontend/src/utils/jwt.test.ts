import { describe, expect, it } from 'vitest'
import { decodeJwt, isExpired } from './jwt'

const b64url = (obj: unknown) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fakeToken = (payload: unknown) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.firma`

describe('decodeJwt', () => {
  it('lee usuario, expiración y roles', () => {
    const claims = decodeJwt(fakeToken({ user_id: 7, exp: 2000000000, roles: ['cajero'] }))
    expect(claims?.user_id).toBe(7)
    expect(claims?.roles).toEqual(['cajero'])
  })

  it('devuelve null con tokens mal formados', () => {
    expect(decodeJwt('basura')).toBeNull()
    expect(decodeJwt('a.%%%.c')).toBeNull()
    expect(decodeJwt(fakeToken({ sin: 'datos' }))).toBeNull()
  })
})

describe('isExpired', () => {
  it('detecta tokens vencidos y vigentes', () => {
    const now = 1_700_000_000_000
    expect(isExpired({ user_id: 1, exp: 1_699_999_999 }, 0, now)).toBe(true)
    expect(isExpired({ user_id: 1, exp: 1_700_000_100 }, 0, now)).toBe(false)
    expect(isExpired({ user_id: 1, exp: 1_700_000_100 }, 200, now)).toBe(true)
  })
})
