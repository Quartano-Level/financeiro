import 'reflect-metadata';
import { container } from 'tsyringe';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import IngestaoPermutasService from '../domain/service/permutas/IngestaoPermutasService.js';

/**
 * Job de ingestão diária de Permutas (Fase B). Espelha `migrations/migrate.ts`:
 *   reflect-metadata → bootstrapAppContainer() → resolve IngestaoPermutasService
 *   → executar({ triggeredBy: 'cron' }) → exit 0/1.
 *
 * Roda o MESMO compute da eleição e persiste o modelo relacional (`/gestao`) +
 * o snapshot (`/painel`, back-compat). READ-ONLY no Conexos; a única escrita é
 * o banco próprio.
 *
 * CRON (NÃO configurado — entrada documentada apenas):
 *   0 6 * * *  cd /caminho/do/repo/src/backend && npm run job:ingest-permutas
 *
 * Exit non-zero em falha (fail-fast) para que o agendador/monitor registre o
 * erro em vez de mascará-lo. Os fatos last-good sobrevivem (ROLLBACK + UPSERT).
 */
const main = async (): Promise<void> => {
    await bootstrapAppContainer();
    const service = container.resolve(IngestaoPermutasService);
    const result = await service.executar({ triggeredBy: 'cron' });
    console.log(
        `[ingest-permutas] run ${result.runId} status=${result.status} ` +
            `adiantamentos=${result.totalAdiantamentos} invoices=${result.totalInvoices} ` +
            `casamentos=${result.totalCasamentos} stale=${result.totalStale}`,
    );
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(
            '[ingest-permutas] ingestion FAILED:',
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    });
