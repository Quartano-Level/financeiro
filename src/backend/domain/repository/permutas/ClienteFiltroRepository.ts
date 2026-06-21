import { inject, injectable } from 'tsyringe';
import PostgreeDatabaseClient from '../../client/database/PostgreeDatabaseClient.js';

/** Cliente filtro: importador cujos adtos vão para permuta manual cross-process. */
export interface ClienteFiltro {
    pesCod: string;
    importador?: string;
    criadoEm: Date;
}

/** Entrada de UPSERT de um cliente filtro (Fase 1). */
export interface UpsertClienteFiltroInput {
    pesCod: string;
    importador?: string;
    criadoPor: string;
}

/**
 * ClienteFiltroRepository — cadastro de importadores "filtro" (Fase 1).
 *
 * Importadores cujos adiantamentos sempre caem em permuta MANUAL cross-process
 * (não há invoice no próprio processo). A pipeline lê `listAtivos()` por run e
 * roteia os adtos desses importadores ao estado `permuta-manual`.
 *
 * SQL 100% parametrizado (`$nome` via SqlBuilder — Rule #5). UPSERT por chave
 * natural (`pes_cod`) para que re-cadastrar seja idempotente.
 */
@injectable()
export default class ClienteFiltroRepository {
    constructor(
        @inject(PostgreeDatabaseClient)
        private databaseClient: PostgreeDatabaseClient,
    ) {}

    public upsertClienteFiltro = async (input: UpsertClienteFiltroInput): Promise<void> => {
        await this.databaseClient.insert(
            `INSERT INTO cliente_filtro (pes_cod, importador, ativo, criado_por, atualizado_em)
             VALUES ($pesCod, $importador, true, $criadoPor, now())
             ON CONFLICT (pes_cod) DO UPDATE SET
                importador = COALESCE(EXCLUDED.importador, cliente_filtro.importador),
                ativo = true,
                atualizado_em = now()`,
            {
                pesCod: input.pesCod,
                importador: input.importador ?? null,
                criadoPor: input.criadoPor,
            },
        );
    };

    /** Lista os clientes filtro ativos (para o cadastro e o roteamento da pipeline). */
    public listAtivos = async (): Promise<ClienteFiltro[]> => {
        const rows = await this.databaseClient.selectMany(
            `SELECT pes_cod, importador, criado_em
             FROM cliente_filtro
             WHERE ativo = true
             ORDER BY criado_em DESC`,
        );
        return rows.map((r) => this.mapRow(r));
    };

    /** Conjunto de `pesCod` ativos — usado pelo roteamento da eleição. */
    public listPesCodsAtivos = async (): Promise<Set<string>> => {
        const rows = await this.databaseClient.selectMany(
            `SELECT pes_cod FROM cliente_filtro WHERE ativo = true`,
        );
        return new Set(rows.map((r) => String(r.pes_cod)));
    };

    /** Remove um cliente filtro (hard delete). Retorna quantas linhas saíram. */
    public deleteByPesCod = async (pesCod: string): Promise<number> => {
        return this.databaseClient.update(`DELETE FROM cliente_filtro WHERE pes_cod = $pesCod`, {
            pesCod,
        });
    };

    private mapRow = (r: Record<string, unknown>): ClienteFiltro => ({
        pesCod: String(r.pes_cod),
        ...(r.importador != null ? { importador: String(r.importador) } : {}),
        criadoEm: new Date(r.criado_em as string | Date),
    });
}
