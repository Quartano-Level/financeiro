import { render, screen } from '@testing-library/react'
import type { ItemHistorico } from '@/app/permutas/components/format'
import {
  fmtData,
  fmtMoeda,
  fmtTaxa,
  maskBrl,
  moedaCodigo,
  numToMask,
  parseBrl,
  somaPorMoeda,
} from '@/app/permutas/components/format'
import { Campo, Moeda } from '@/app/permutas/components/ui'
import { PermutaPendenteTable } from '@/app/permutas/components/PermutaPendenteTable'
import { AbaHistorico } from '@/app/permutas/components/AbaHistorico'
import type { PermutaPendente } from '@/lib/types'
import { useTabelaFiltro } from '@/app/permutas/components/tabela-filtro'

// Pure helpers extracted from the god-component during the CC-1 split.
describe('permutas format helpers', () => {
  it('moedaCodigo encurta nomes longos do Conexos', () => {
    expect(moedaCodigo('DOLAR DOS EUA')).toBe('USD')
    expect(moedaCodigo('EURO/COM.EUROPEIA')).toBe('EUR')
    expect(moedaCodigo('USD')).toBe('USD') // já curto → passthrough
  })

  it('parseBrl interpreta milhar (.) e decimal (,) pt-BR', () => {
    expect(parseBrl('5.557,42')).toBe(5557.42)
    expect(parseBrl('5000')).toBe(5000)
  })

  it('maskBrl lê dígitos como centavos', () => {
    expect(maskBrl('4336604')).toBe('43.366,04')
    expect(maskBrl('')).toBe('')
  })

  it('numToMask converte número para a string mascarada', () => {
    expect(numToMask(43366.04)).toBe('43.366,04')
  })

  it('fmtData/fmtTaxa formatam com fallback', () => {
    expect(fmtData(undefined)).toBe('—')
    expect(fmtTaxa(5.5)).toContain('5,5')
  })

  it('fmtMoeda cai no fallback quando a moeda não é ISO', () => {
    expect(fmtMoeda(1234, 'XYZ')).toContain('XYZ')
  })

  it('somaPorMoeda agrupa por moeda e coloca USD na frente', () => {
    const totais = somaPorMoeda([
      { valorMoedaNegociada: 100, moeda: 'EURO/COM.EUROPEIA' },
      { valorMoedaNegociada: 200, moeda: 'DOLAR DOS EUA' },
      { valorMoedaNegociada: null, moeda: 'DOLAR DOS EUA' },
    ])
    expect(totais[0]).toEqual({ moeda: 'USD', total: 200 })
    expect(totais).toContainEqual({ moeda: 'EUR', total: 100 })
  })
})

describe('Moeda', () => {
  it('mostra valor + código da moeda', () => {
    render(<Moeda valor={1234.5} moeda="DOLAR DOS EUA" />)
    expect(screen.getByText('USD')).toBeInTheDocument()
  })

  it('mostra travessão quando valor é null', () => {
    render(<Moeda valor={null} moeda="USD" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

function makePendente(over: Partial<PermutaPendente> = {}): PermutaPendente {
  return {
    docCod: 'ADTO-1',
    filCod: 4,
    referencia: 'REF',
    exportador: 'ACME LTDA',
    valorMoedaNegociada: 1000,
    moeda: 'USD',
    diasEmAberto: 3,
    status: 'permuta-manual',
    saldoRestante: 1000,
    alocacoes: [],
    ...over,
  }
}

describe('PermutaPendenteTable', () => {
  it('mostra o estado-vazio sem itens', () => {
    render(
      <PermutaPendenteTable
        list={[]}
        statusPorAdto={{}}
        abrirAlocar={() => {}}
        abrirReconciliar={() => {}}
      />,
    )
    expect(screen.getByText('Nenhuma permuta cross-process')).toBeInTheDocument()
  })

  it('desabilita "Baixar" quando não há alocações e mantém "Alocar" habilitado com saldo', () => {
    render(
      <PermutaPendenteTable
        list={[makePendente()]}
        statusPorAdto={{}}
        abrirAlocar={() => {}}
        abrirReconciliar={() => {}}
      />,
    )
    expect(screen.getByText('ADTO-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Baixar/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Alocar/ })).toBeEnabled()
  })

  it('desabilita "Alocar" quando totalmente alocado sem alocações para gerenciar', () => {
    render(
      <PermutaPendenteTable
        list={[makePendente({ saldoRestante: 0, alocacoes: [] })]}
        statusPorAdto={{}}
        abrirAlocar={() => {}}
        abrirReconciliar={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Alocar/ })).toBeDisabled()
  })
})

// Wrapper para exercitar a aba (que recebe o resultado do hook useTabelaFiltro).
function HistoricoHarness({ items }: { items: ItemHistorico[] }) {
  const aba = useTabelaFiltro(
    items,
    (h) => h.filCod,
    (h) => h.busca,
  )
  return <AbaHistorico aba={aba} loading={false} onAtualizar={() => {}} />
}

describe('AbaHistorico', () => {
  it('mostra o estado-vazio sem histórico', () => {
    render(<HistoricoHarness items={[]} />)
    expect(screen.getByText('Nada no histórico ainda')).toBeInTheDocument()
  })

  it('lista uma permuta executada', () => {
    const item: ItemHistorico = {
      key: 'auto-ADTO-1-77',
      tipo: 'Automática',
      filCod: 4,
      priCod: '523',
      cliente: 'CLIENTE X',
      exportador: 'ACME',
      adtoDocCod: 'ADTO-1',
      valor: 1000,
      moeda: 'USD',
      borCod: 77,
      finalizado: true,
      busca: '523 CLIENTE X ADTO-1 77',
    }
    render(<HistoricoHarness items={[item]} />)
    expect(screen.getByText('523')).toBeInTheDocument()
    expect(screen.getByText('Finalizado')).toBeInTheDocument()
  })
})

// Regressão do overflow Cliente/Exportador no painel de detalhe (fix layout):
// nomes longos truncam em 2 linhas com reticências e expõem o texto completo
// no hover via `title`, sem invadir a coluna vizinha.
describe('Campo — clamp + tooltip', () => {
  const NOME_LONGO = 'HUBNER COMPONENTES E SISTEMAS PARA IMPLEMENTOS RODOVIÁRIOS'

  it('com clamp: trunca em 2 linhas e expõe o texto completo no title', () => {
    render(
      <Campo label="Cliente" clamp title={NOME_LONGO}>
        {NOME_LONGO}
      </Campo>,
    )
    const dd = screen.getByText(NOME_LONGO)
    expect(dd).toHaveClass('line-clamp-2')
    expect(dd).toHaveAttribute('title', NOME_LONGO)
    // encolhe no grid — não empurra/invade a coluna ao lado
    expect(dd.closest('div')).toHaveClass('min-w-0')
  })

  it('sem clamp (default): mantém wrap e não trunca nem seta title', () => {
    render(<Campo label="Valor">R$ 1.234,56</Campo>)
    const dd = screen.getByText('R$ 1.234,56')
    expect(dd).toHaveClass('break-words')
    expect(dd).not.toHaveClass('line-clamp-2')
    expect(dd).not.toHaveAttribute('title')
  })
})
