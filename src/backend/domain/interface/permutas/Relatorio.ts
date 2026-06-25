/**
 * Tipos dos relatórios exportáveis (.xlsx) do painel de Permutas.
 *
 * Cada relatório é uma PROJEÇÃO read-only de `GET /permutas/gestao` — não há
 * estado, entidade ou invariante novo. As definições (colunas) servem de
 * referência tanto para o serviço quanto para os testes.
 */

/** Slugs dos relatórios — espelham o `:tipo` da rota `GET /permutas/relatorios/:tipo`. */
export const RELATORIO_TIPOS = [
    'adiantamentos',
    'invoices',
    'ja-permutado',
    'bloqueadas',
    'reconciliacao-processo',
    'clientes',
] as const;

export type RelatorioTipo = (typeof RELATORIO_TIPOS)[number];

/** Valor de uma célula da planilha. `null` → célula em branco. */
export type CelulaValor = string | number | boolean | null;

/** Definição de uma coluna (cabeçalho + chave da linha + largura opcional). */
export interface ColunaRelatorio {
    header: string;
    key: string;
    width?: number;
}

/**
 * Definição completa de um relatório, ANTES da serialização em xlsx. É a
 * fronteira testável: os testes asseguram colunas/linhas; a serialização
 * (exceljs) é um detalhe verificado por um único smoke-test de buffer.
 */
export interface RelatorioDefinicao {
    tipo: RelatorioTipo;
    /** Rótulo humano (nome da aba + título do arquivo). */
    titulo: string;
    colunas: ColunaRelatorio[];
    linhas: Array<Record<string, CelulaValor>>;
}

/** Verifica se uma string é um `RelatorioTipo` válido (guard de boundary). */
export const isRelatorioTipo = (value: string): value is RelatorioTipo =>
    (RELATORIO_TIPOS as readonly string[]).includes(value);
