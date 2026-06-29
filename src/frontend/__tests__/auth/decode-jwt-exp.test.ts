/**
 * `decodeJwtExp` reads the `exp` claim without verifying the signature (the
 * backend does that). It must tolerate any malformed token by returning null.
 */
import { decodeJwtExp } from '@/lib/auth/token'

const b64url = (o: object): string => Buffer.from(JSON.stringify(o)).toString('base64url')
const makeJwt = (payload: object): string => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`

describe('decodeJwtExp', () => {
  it('returns the exp claim for a valid token', () => {
    expect(decodeJwtExp(makeJwt({ sub: 'u', exp: 1234567890 }))).toBe(1234567890)
  })

  it('returns null when exp is absent or non-numeric', () => {
    expect(decodeJwtExp(makeJwt({ sub: 'u' }))).toBeNull()
    expect(decodeJwtExp(makeJwt({ exp: 'soon' }))).toBeNull()
  })

  it('returns null for malformed tokens', () => {
    expect(decodeJwtExp('not-a-jwt')).toBeNull()
    expect(decodeJwtExp('')).toBeNull()
  })
})
