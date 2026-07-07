import 'reflect-metadata';
import { container } from 'tsyringe';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import SispagPainelService from '../domain/service/sispag/SispagPainelService.js';

/**
 * Validador one-shot do painel SISPAG (READ-ONLY) — resolve o serviço real e
 * imprime o resumo, sem subir o Express. Prova o caminho de leitura ponta-a-ponta
 * contra o Conexos PRD. Descartável.
 */
async function main(): Promise<void> {
    await bootstrapAppContainer();
    const service = container.resolve(SispagPainelService);
    const painel = await service.montarPainel();
    console.log('modo:', painel.modo);
    console.log('kpis:', painel.kpis);
    console.log(
        'titulos(top5):',
        painel.titulos.slice(0, 5).map((t) => ({
            docCod: t.docCod,
            credor: t.credor,
            valor: t.valor,
            dias: t.diasAteVencimento,
            liberado: t.liberado,
        })),
    );
    console.log(
        'lotes(top3):',
        painel.lotes.slice(0, 3).map((l) => ({
            banco: l.banco,
            status: l.status,
            enviado: l.envioConfirmado,
            titulos: l.titulosCount,
            soma: l.soma,
        })),
    );
    console.log(
        `totais: titulos=${painel.titulos.length} lotes=${painel.lotes.length} borderos=${painel.borderos.length}`,
    );
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('FAILED:', e instanceof Error ? e.stack : String(e));
        process.exit(1);
    });
