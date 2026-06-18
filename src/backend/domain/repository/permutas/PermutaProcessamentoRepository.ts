import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';
import {
    type Processamento,
    PROCESSAMENTO_STATUS,
    type ProcessamentoStatus,
} from '../../interface/permutas/Processamento.js';

/** Entrada de UPSERT do estado do analista (botão "Processar"). */
export interface UpsertProcessamentoInput {
    adiantamentoDocCod: string;
    status: ProcessamentoStatus;
    invoiceDocCod?: string;
    observacao?: string;
    processadoPor: string;
}

/**
 * PermutaProcessamentoRepository — persiste o estado do analista (Fase B).
 *
 * SQL 100% parametrizado (`$nome` via SqlBuilder — Rule #5, zero interpolação).
 * UPSERT por chave natural (`adiantamento_doc_cod`) — `ON CONFLICT DO UPDATE` —
 * para que re-processar um adiantamento atualize o registro em vez de duplicar.
 * O `processado_em` carimba quando o status vira `processado`.
 */
@injectable()
export default class PermutaProcessamentoRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    public upsertProcessamento = async (input: UpsertProcessamentoInput): Promise<void> => {
        const processadoEm =
            input.status === PROCESSAMENTO_STATUS.PROCESSADO ? new Date().toISOString() : null;
        await this.databaseClient.insert(
            `INSERT INTO permuta_processamento (
                adiantamento_doc_cod, status, invoice_doc_cod, observacao,
                processado_por, processado_em, updated_at
            ) VALUES (
                $adiantamentoDocCod, $status, $invoiceDocCod, $observacao,
                $processadoPor, $processadoEm, now()
            )
            ON CONFLICT (adiantamento_doc_cod) DO UPDATE SET
                status = EXCLUDED.status,
                invoice_doc_cod = EXCLUDED.invoice_doc_cod,
                observacao = EXCLUDED.observacao,
                processado_por = EXCLUDED.processado_por,
                processado_em = EXCLUDED.processado_em,
                updated_at = now()`,
            {
                adiantamentoDocCod: input.adiantamentoDocCod,
                status: input.status,
                invoiceDocCod: input.invoiceDocCod ?? null,
                observacao: input.observacao ?? null,
                processadoPor: input.processadoPor,
                processadoEm,
            },
        );
    };

    public findProcessamento = async (docCod: string): Promise<Processamento | null> => {
        const row = await this.databaseClient.selectFirst<Record<string, unknown>>(
            `SELECT adiantamento_doc_cod, status, invoice_doc_cod, observacao,
                    processado_por, processado_em
             FROM permuta_processamento
             WHERE adiantamento_doc_cod = $docCod`,
            { docCod },
        );
        return row ? this.mapRow(row) : null;
    };

    public listProcessamentos = async (status?: ProcessamentoStatus): Promise<Processamento[]> => {
        const rows = status
            ? await this.databaseClient.selectMany(
                  `SELECT adiantamento_doc_cod, status, invoice_doc_cod, observacao,
                          processado_por, processado_em
                   FROM permuta_processamento
                   WHERE status = $status`,
                  { status },
              )
            : await this.databaseClient.selectMany(
                  `SELECT adiantamento_doc_cod, status, invoice_doc_cod, observacao,
                          processado_por, processado_em
                   FROM permuta_processamento`,
              );
        return rows.map((r) => this.mapRow(r));
    };

    private mapRow = (r: Record<string, unknown>): Processamento => ({
        adiantamentoDocCod: String(r.adiantamento_doc_cod),
        status: String(r.status) as ProcessamentoStatus,
        ...(r.invoice_doc_cod != null ? { invoiceDocCod: String(r.invoice_doc_cod) } : {}),
        ...(r.observacao != null ? { observacao: String(r.observacao) } : {}),
        ...(r.processado_por != null ? { processadoPor: String(r.processado_por) } : {}),
        ...(r.processado_em != null ? { processadoEm: new Date(String(r.processado_em)) } : {}),
    });
}
