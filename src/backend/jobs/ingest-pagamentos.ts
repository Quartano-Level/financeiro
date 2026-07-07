import 'reflect-metadata';
import { container } from 'tsyringe';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import IngestaoPagamentosService from '../domain/service/sispag/IngestaoPagamentosService.js';

/**
 * Job de ingestão diária da carteira de PAGAMENTOS (SISPAG). Espelha
 * `jobs/ingest-permutas.ts`: lê os títulos a pagar do Conexos e persiste os dados
 * básicos em `titulo_a_pagar` + grava o run de auditoria. READ-ONLY no ERP.
 *
 * CRON (NÃO configurado — entrada documentada apenas):
 *   0 6 * * *  cd /caminho/do/repo/src/backend && npm run job:ingest-pagamentos
 *
 * Exit non-zero em falha (fail-fast) para o agendador registrar o erro.
 */
const main = async (): Promise<void> => {
    await bootstrapAppContainer();
    const service = container.resolve(IngestaoPagamentosService);
    const result = await service.executar({ triggeredBy: 'cron' });
    console.log(
        `[ingest-pagamentos] run ${result.runId} status=${result.status} ` +
            `titulos=${result.totalTitulos} inativados=${result.totalInativados}`,
    );
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(
            '[ingest-pagamentos] ingestion FAILED:',
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    });
