import { formatDate } from '@/lib/utils'

describe('formatDate', () => {
    const originalTZ = process.env.TZ

    afterEach(() => {
        process.env.TZ = originalTZ
    })

    it('returns an em dash for empty input', () => {
        expect(formatDate('')).toBe('—')
    })

    it('returns an em dash for unparseable input', () => {
        expect(formatDate('not-a-date')).toBe('—')
    })

    // Regression: date-only ISO strings used to be parsed as UTC midnight and
    // formatted in the local timezone, shifting the day back by one for any
    // user behind UTC (e.g. Brazil). The displayed day must be stable across
    // timezones.
    describe.each(['UTC', 'America/Sao_Paulo', 'Asia/Tokyo'])(
        'date-only ISO strings in timezone %s',
        (tz) => {
            beforeEach(() => {
                process.env.TZ = tz
            })

            it('does not shift the day', () => {
                expect(formatDate('2026-01-13')).toBe('13/01/2026')
                expect(formatDate('2026-01-14')).toBe('14/01/2026')
                expect(formatDate('2026-03-02')).toBe('02/03/2026')
                expect(formatDate('2026-03-31')).toBe('31/03/2026')
            })
        },
    )
})
