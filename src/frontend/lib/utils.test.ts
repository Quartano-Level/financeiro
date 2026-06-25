import { formatDate, ordenarBorderosPainel, progressoPagamento } from '@/lib/utils'

describe('ordenarBorderosPainel', () => {
  const b = (
    borCod: number,
    situacao: string,
    daTrilha: boolean,
    criadoEm: string,
  ) => ({ borCod, situacao, daTrilha, criadoEm })

  it('põe os EM ABERTO da nossa trilha no topo (por data desc); resto por data desc', () => {
    const entrada = [
      b(1, 'FINALIZADO', true, '2026-06-25T16:35:00Z'), // nosso, finalizado
      b(2, 'EM_CADASTRO', true, '2026-06-25T16:20:00Z'), // nosso, EM ABERTO (sobe)
      b(3, 'EM_CADASTRO', false, '2026-06-25T16:30:00Z'), // ERP em aberto → NÃO sobe (fica por data)
      b(4, 'EM_CADASTRO', true, '2026-06-25T16:24:00Z'), // nosso, EM ABERTO (sobe, mais novo que o 2)
    ]
    const ordenado = ordenarBorderosPainel(entrada).map((x) => x.borCod)
    // Topo: nossos em-aberto por data desc (4 @16:24 antes de 2 @16:20); depois resto por data desc (1 @16:35, 3 @16:30).
    expect(ordenado).toEqual([4, 2, 1, 3])
  })

  it('ERP em aberto NÃO sobe acima de um finalizado mais recente (mantém data)', () => {
    const entrada = [
      b(10, 'FINALIZADO', true, '2026-06-25T17:00:00Z'),
      b(11, 'EM_CADASTRO', false, '2026-06-25T16:00:00Z'), // ERP, em aberto, mais antigo
    ]
    expect(ordenarBorderosPainel(entrada).map((x) => x.borCod)).toEqual([10, 11])
  })

  it('não muta a entrada', () => {
    const entrada = [b(1, 'FINALIZADO', true, 'a'), b(2, 'EM_CADASTRO', true, 'b')]
    const copia = [...entrada]
    ordenarBorderosPainel(entrada)
    expect(entrada).toEqual(copia)
  })
})

describe('progressoPagamento', () => {
  it('computes % pago, falta em BRL e USD para um pagamento parcial', () => {
    // face 1000, 400 em aberto → 60% pago; falta 400 BRL = 80 USD (taxa 5).
    const p = progressoPagamento(1000, 400, 5)
    expect(p).toEqual({ percentPago: 60, faltaBrl: 400, faltaUsd: 80 })
  })

  it('arredonda o percentual PARA BAIXO (não totalmente pago nunca lê 100%)', () => {
    // face 12393942.73, aberto 4580000 → 63.04% → 63.
    expect(progressoPagamento(12393942.73, 4580000)?.percentPago).toBe(63)
    // quase pago (falta R$ 0,02 de ~R$20M) → 99%, NUNCA 100%.
    expect(progressoPagamento(20373009.89, 0.02)?.percentPago).toBe(99)
  })

  it('faltaUsd é null sem taxa válida', () => {
    expect(progressoPagamento(1000, 400)?.faltaUsd).toBeNull()
    expect(progressoPagamento(1000, 400, 0)?.faltaUsd).toBeNull()
  })

  it('retorna null quando não há o que mostrar (sem total, total ≤ 0, ou nada em aberto)', () => {
    expect(progressoPagamento(undefined, 400, 5)).toBeNull()
    expect(progressoPagamento(1000, undefined, 5)).toBeNull()
    expect(progressoPagamento(0, 400, 5)).toBeNull()
    expect(progressoPagamento(1000, 0, 5)).toBeNull() // totalmente pago
  })
})

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
