import 'reflect-metadata';
import { container } from 'tsyringe';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import FormacaoLotesService from '../domain/service/sispag/FormacaoLotesService.js';

/**
 * Job de FORMAÇÃO AUTOMÁTICA de lotes SISPAG — roda LOGO APÓS a ingestão.
 * Monta lotes candidatos (RASCUNHO) com os títulos a vencer (≤7d), por filial × classe ×
 * banco, e desfaz os lotes automáticos que venceram. Escreve só no Postgres (READ-only no ERP).
 *
 * CRON (NÃO configurado — documentado; roda depois de `job:ingest-pagamentos`):
 *   10 6 * * *  cd /caminho/do/repo/src/backend && npm run job:formar-lotes
 */
const main = async (): Promise<void> => {
    await bootstrapAppContainer();
    const service = container.resolve(FormacaoLotesService);
    const r = await service.formar({ triggeredBy: 'cron' });
    console.log(
        `[formar-lotes] lotes formados=${r.lotesFormados} títulos=${r.titulosLotados} ` +
            `desfeitos=${r.lotesDesfeitos}`,
    );
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(
            '[formar-lotes] formation FAILED:',
            error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
    });
