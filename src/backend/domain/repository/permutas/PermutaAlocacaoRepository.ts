import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';

/** Linha de alocação manual N:M cross-process (Fase 2). */
export interface AlocacaoRow {
    adiantamentoDocCod: string;
    invoiceDocCod: string;
    invoicePriCod?: string;
    valorAlocado: number;
    moeda?: string;
    variacaoClassificacao?: string;
    variacaoResultado?: number;
    variacaoDelta?: number;
    taxaAdiantamento?: number;
    taxaInvoice?: number;
    criadoPor?: string;
    criadoEm: Date;
    observacao?: string;
}

/** Entrada de UPSERT de uma alocação. */
export interface UpsertAlocacaoInput {
    adiantamentoDocCod: string;
    invoiceDocCod: string;
    invoicePriCod?: string;
    valorAlocado: number;
    moeda?: string;
    variacaoClassificacao?: string;
    variacaoResultado?: number;
    variacaoDelta?: number;
    taxaAdiantamento?: number;
    taxaInvoice?: number;
    criadoPor: string;
    observacao?: string;
}

/**
 * PermutaAlocacaoRepository — persiste as alocações manuais N:M cross-process
 * (Fase 2). Links livres adto↔invoice (não assume `priCod` igual). SOBREVIVE à
 * re-ingestão (≠ permuta_casamento). SQL 100% parametrizado (Rule #5); UPSERT por
 * par natural `(adiantamento_doc_cod, invoice_doc_cod)`.
 */
@injectable()
export default class PermutaAlocacaoRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    public upsertAlocacao = async (input: UpsertAlocacaoInput): Promise<void> => {
        await this.databaseClient.insert(
            `INSERT INTO permuta_alocacao (
                adiantamento_doc_cod, invoice_doc_cod, invoice_pri_cod, valor_alocado, moeda,
                variacao_classificacao, variacao_resultado, variacao_delta,
                taxa_adiantamento, taxa_invoice, criado_por, observacao, atualizado_em
            ) VALUES (
                $adtoDocCod, $invoiceDocCod, $invoicePriCod, $valorAlocado, $moeda,
                $varClass, $varResultado, $varDelta,
                $taxaAdto, $taxaInvoice, $criadoPor, $observacao, now()
            )
            ON CONFLICT (adiantamento_doc_cod, invoice_doc_cod) DO UPDATE SET
                invoice_pri_cod = EXCLUDED.invoice_pri_cod,
                valor_alocado = EXCLUDED.valor_alocado,
                moeda = EXCLUDED.moeda,
                variacao_classificacao = EXCLUDED.variacao_classificacao,
                variacao_resultado = EXCLUDED.variacao_resultado,
                variacao_delta = EXCLUDED.variacao_delta,
                taxa_adiantamento = EXCLUDED.taxa_adiantamento,
                taxa_invoice = EXCLUDED.taxa_invoice,
                observacao = EXCLUDED.observacao,
                atualizado_em = now()`,
            {
                adtoDocCod: input.adiantamentoDocCod,
                invoiceDocCod: input.invoiceDocCod,
                invoicePriCod: input.invoicePriCod ?? null,
                valorAlocado: input.valorAlocado,
                moeda: input.moeda ?? null,
                varClass: input.variacaoClassificacao ?? null,
                varResultado: input.variacaoResultado ?? null,
                varDelta: input.variacaoDelta ?? null,
                taxaAdto: input.taxaAdiantamento ?? null,
                taxaInvoice: input.taxaInvoice ?? null,
                criadoPor: input.criadoPor,
                observacao: input.observacao ?? null,
            },
        );
    };

    public listAtivas = async (): Promise<AlocacaoRow[]> => {
        const rows = await this.databaseClient.selectMany(
            `SELECT adiantamento_doc_cod, invoice_doc_cod, invoice_pri_cod, valor_alocado, moeda,
                    variacao_classificacao, variacao_resultado, variacao_delta,
                    taxa_adiantamento, taxa_invoice, criado_por, criado_em, observacao
             FROM permuta_alocacao
             ORDER BY adiantamento_doc_cod, criado_em`,
        );
        return rows.map((r) => this.mapRow(r));
    };

    /** Σ valor_alocado de um adiantamento, opcionalmente EXCLUINDO um par (re-alocação). */
    public sumByAdiantamento = async (
        adiantamentoDocCod: string,
        excludeInvoiceDocCod?: string,
    ): Promise<number> => {
        const row = await this.databaseClient.selectFirst<{ total: string | number }>(
            `SELECT COALESCE(SUM(valor_alocado), 0) AS total
             FROM permuta_alocacao
             WHERE adiantamento_doc_cod = $adtoDocCod
               AND ($excludeInvoice::text IS NULL OR invoice_doc_cod <> $excludeInvoice)`,
            { adtoDocCod: adiantamentoDocCod, excludeInvoice: excludeInvoiceDocCod ?? null },
        );
        return row ? Number(row.total) : 0;
    };

    /** Σ valor_alocado de uma invoice, opcionalmente EXCLUINDO um par (re-alocação). */
    public sumByInvoice = async (
        invoiceDocCod: string,
        excludeAdiantamentoDocCod?: string,
    ): Promise<number> => {
        const row = await this.databaseClient.selectFirst<{ total: string | number }>(
            `SELECT COALESCE(SUM(valor_alocado), 0) AS total
             FROM permuta_alocacao
             WHERE invoice_doc_cod = $invoiceDocCod
               AND ($excludeAdto::text IS NULL OR adiantamento_doc_cod <> $excludeAdto)`,
            { invoiceDocCod, excludeAdto: excludeAdiantamentoDocCod ?? null },
        );
        return row ? Number(row.total) : 0;
    };

    public deleteAlocacao = async (
        adiantamentoDocCod: string,
        invoiceDocCod: string,
    ): Promise<number> => {
        return this.databaseClient.update(
            `DELETE FROM permuta_alocacao
             WHERE adiantamento_doc_cod = $adtoDocCod AND invoice_doc_cod = $invoiceDocCod`,
            { adtoDocCod: adiantamentoDocCod, invoiceDocCod },
        );
    };

    private mapRow = (r: Record<string, unknown>): AlocacaoRow => ({
        adiantamentoDocCod: String(r.adiantamento_doc_cod),
        invoiceDocCod: String(r.invoice_doc_cod),
        ...(r.invoice_pri_cod != null ? { invoicePriCod: String(r.invoice_pri_cod) } : {}),
        valorAlocado: Number(r.valor_alocado),
        ...(r.moeda != null ? { moeda: String(r.moeda) } : {}),
        ...(r.variacao_classificacao != null
            ? { variacaoClassificacao: String(r.variacao_classificacao) }
            : {}),
        ...(r.variacao_resultado != null
            ? { variacaoResultado: Number(r.variacao_resultado) }
            : {}),
        ...(r.variacao_delta != null ? { variacaoDelta: Number(r.variacao_delta) } : {}),
        ...(r.taxa_adiantamento != null ? { taxaAdiantamento: Number(r.taxa_adiantamento) } : {}),
        ...(r.taxa_invoice != null ? { taxaInvoice: Number(r.taxa_invoice) } : {}),
        ...(r.criado_por != null ? { criadoPor: String(r.criado_por) } : {}),
        criadoEm: new Date(r.criado_em as string | Date),
        ...(r.observacao != null ? { observacao: String(r.observacao) } : {}),
    });
}
