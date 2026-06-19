import type { GestaoPermutasResponse } from './types'

/**
 * Fixture de demonstração da "Gestão de Permutas".
 *
 * Dados ancorados no que foi sondado contra o Conexos real (dev tenant Columbia,
 * filCod=2, 2026-06-18): exportadores e referências reais (DBP PIPING, QINGDAO
 * COVENANT, CENTENO INTERNATIONAL, PANTECH, etc.), valores plausíveis em moeda
 * negociada (USD) e dias em aberto. Reproduz o mockup do Yuri, incluindo um
 * caso de casamento N:M com permuta PARCIAL (valor a ser usado < total).
 *
 * É a rede de segurança do demo: a tela funciona só com `npm run dev`, sem
 * Postgres nem Conexos ao vivo. Quando o banco local estiver semeado (Fase B),
 * `fetchGestaoPermutas` passa a preferir o backend e este fixture vira fallback.
 */
export const gestaoPermutasFixture: GestaoPermutasResponse = {
  fonte: 'fixture',
  geradoEm: '2026-06-18T12:00:00.000Z',
  pendentes: [
    {
      docCod: '26471',
      filCod: 2,
      referencia: 'CT012-016-021/2',
      exportador: 'DBP PIPING CO.,LTD',
      valorMoedaNegociada: 72343.66,
      moeda: 'USD',
      diasEmAberto: 31,
      status: 'elegivel',
    },
    {
      docCod: '17VTC26',
      filCod: 2,
      referencia: '0017VTC/26',
      exportador: 'NORMET OY',
      valorMoedaNegociada: 193720.5,
      moeda: 'USD',
      diasEmAberto: 28,
      status: 'elegivel',
    },
    {
      docCod: '24166',
      filCod: 2,
      referencia: 'CT022/26 6º',
      exportador: 'QINGDAO COVENANT PIPELINE CO LTD',
      valorMoedaNegociada: 50159.7,
      moeda: 'USD',
      diasEmAberto: 22,
      status: 'elegivel',
    },
    {
      docCod: '1INX',
      filCod: 2,
      referencia: '00001INX',
      exportador: 'CENTENO INTERNATIONAL LIMITED',
      valorMoedaNegociada: 45645.95,
      moeda: 'USD',
      diasEmAberto: 15,
      status: 'elegivel',
    },
    {
      docCod: '6DYS26',
      filCod: 1,
      referencia: '0006DYS/26',
      exportador: 'DAH SOLAR CO LTD',
      valorMoedaNegociada: 56609.28,
      moeda: 'USD',
      diasEmAberto: 10,
      status: 'elegivel',
    },
    {
      docCod: '25917',
      filCod: 2,
      referencia: 'CT088/26',
      exportador: 'SUN MARK STAINLESS PVT LTD',
      valorMoedaNegociada: 38120.0,
      moeda: 'USD',
      diasEmAberto: 9,
      status: 'bloqueada',
      motivoBloqueio: 'data-base-indisponivel',
    },
    {
      docCod: '25912',
      filCod: 2,
      referencia: 'CT049/26 1º',
      exportador: 'PANTECH STAINLESS ALLOY INDUSTRIES',
      valorMoedaNegociada: 61894.4,
      moeda: 'USD',
      diasEmAberto: 6,
      status: 'bloqueada',
      motivoBloqueio: 'sem-invoice',
    },
    {
      // N:M — passou os 4 gates, mas o processo tem >1 INVOICE FINALIZADA: falta
      // só o analista escolher a invoice (ADR-0005). Não é bloqueada.
      docCod: '26102',
      filCod: 2,
      referencia: 'CT077/26 3º',
      exportador: 'JINDAL STAINLESS LIMITED',
      valorMoedaNegociada: 84210.15,
      moeda: 'USD',
      diasEmAberto: 12,
      status: 'casamento-manual',
      motivoBloqueio: 'composto-nm',
      // N:M — o processo CT077/26 tem 2 invoices finalizadas em aberto; o analista
      // escolhe UMA para casar este adiantamento.
      candidatas: [
        {
          docCod: 'INV-26102A',
          filCod: 2,
          referencia: 'CT077/26 3º (A)',
          exportador: 'JINDAL STAINLESS LIMITED',
          valorMoedaNegociada: 50000.0,
          moeda: 'USD',
        },
        {
          docCod: 'INV-26102B',
          filCod: 2,
          referencia: 'CT077/26 3º (B)',
          exportador: 'JINDAL STAINLESS LIMITED',
          valorMoedaNegociada: 84210.15,
          moeda: 'USD',
        },
      ],
    },
  ],
  invoicesEmAberto: [
    {
      docCod: 'INV-17VTC',
      filCod: 2,
      referencia: '0017VTC/26',
      exportador: 'NORMET OY',
      valorMoedaNegociada: 193720.5,
      moeda: 'USD',
    },
    {
      docCod: 'INV-1INX',
      filCod: 2,
      referencia: '00001INX',
      exportador: 'CENTENO INTERNATIONAL LIMITED',
      valorMoedaNegociada: 45645.95,
      moeda: 'USD',
    },
    {
      docCod: 'INV-6DYS',
      filCod: 1,
      referencia: '0006DYS/26',
      exportador: 'DAH SOLAR CO LTD',
      valorMoedaNegociada: 56609.28,
      moeda: 'USD',
    },
  ],
  casamentos: [
    {
      // N:M + permuta PARCIAL: a invoice 0017VTC/26 é abatida por 3 adiantamentos,
      // cada um usando só parte do seu saldo (Valor a ser Usado < total).
      priCod: '512',
      invoice: {
        docCod: 'INV-17VTC',
        filCod: 2,
        referencia: '0017VTC/26',
        exportador: 'NORMET OY',
        valorMoedaNegociada: 193720.5,
        moeda: 'USD',
      },
      adiantamentos: [
        { docCod: '17VTC26', referencia: '0017VTC/26', valorASerUsado: 100000.0, moeda: 'USD' },
        { docCod: '1INX', referencia: '00001INX', valorASerUsado: 93000.0, moeda: 'USD' },
        { docCod: '6DYS26', referencia: '0006DYS/26', valorASerUsado: 720.5, moeda: 'USD' },
      ],
    },
    {
      priCod: '498',
      invoice: {
        docCod: 'INV-1INX',
        filCod: 2,
        referencia: '00001INX',
        exportador: 'CENTENO INTERNATIONAL LIMITED',
        valorMoedaNegociada: 45645.95,
        moeda: 'USD',
      },
      adiantamentos: [],
    },
    {
      priCod: '503',
      invoice: {
        docCod: 'INV-6DYS',
        filCod: 1,
        referencia: '0006DYS/26',
        exportador: 'DAH SOLAR CO LTD',
        valorMoedaNegociada: 56609.28,
        moeda: 'USD',
      },
      adiantamentos: [],
    },
  ],
  totais: {
    pendentes: 8,
    invoicesEmAberto: 3,
    elegiveis: 5,
    bloqueadas: 1,
    casamentoManual: 1,
    jaPermutado: 0,
  },
}
