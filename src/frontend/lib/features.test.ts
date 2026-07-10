import { isSispagEnabled } from '@/lib/features'

describe('isSispagEnabled', () => {
  const orig = { ...process.env }
  afterEach(() => {
    process.env.NEXT_PUBLIC_SISPAG_ENABLED = orig.NEXT_PUBLIC_SISPAG_ENABLED
    process.env.NEXT_PUBLIC_ENV = orig.NEXT_PUBLIC_ENV
  })

  it('flag "true"/"false" força', () => {
    process.env.NEXT_PUBLIC_SISPAG_ENABLED = 'true'
    process.env.NEXT_PUBLIC_ENV = 'production'
    expect(isSispagEnabled()).toBe(true)
    process.env.NEXT_PUBLIC_SISPAG_ENABLED = 'false'
    process.env.NEXT_PUBLIC_ENV = 'local'
    expect(isSispagEnabled()).toBe(false)
  })

  it('sem a env: habilitado só em local (deployado = bloqueado, fail-safe)', () => {
    process.env.NEXT_PUBLIC_SISPAG_ENABLED = ''
    process.env.NEXT_PUBLIC_ENV = 'local'
    expect(isSispagEnabled()).toBe(true)
    process.env.NEXT_PUBLIC_ENV = 'production'
    expect(isSispagEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_ENV = ''
    expect(isSispagEnabled()).toBe(false)
  })
})
