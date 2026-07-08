import 'reflect-metadata';
import { container } from 'tsyringe';
import { bootstrapAppContainer } from '../domain/appContainer.js';
import ConexosBaseClient from '../domain/client/ConexosBaseClient.js';
import ConexosSispagClient from '../domain/client/ConexosSispagClient.js';

/** Probe #4 (READ-ONLY): valida a classificação EX (internacional) — com298 vs fin064. */
async function main(): Promise<void> {
    await bootstrapAppContainer();
    const base = container.resolve(ConexosBaseClient);
    const sispag = container.resolve(ConexosSispagClient);
    await base.ensureSid();
    const FIL = 2;

    // 1) conjunto EX do com298
    const ex = await sispag.listExteriorDocCods(FIL);
    console.log(`[probe4] EX docCods (fil ${FIL}): count=${ex.size}`);
    console.log('[probe4] amostra EX:', [...ex].slice(0, 15));

    // 2) SKYJACK: acha nos títulos fin064 e checa se está no set EX
    const titulos = await sispag.listTitulosAPagar(FIL, {});
    const sky = titulos.filter((t) => (t.credor ?? '').toUpperCase().includes('SKYJACK'));
    console.log(`[probe4] títulos SKYJACK (fin064): ${sky.length}`);
    for (const t of sky.slice(0, 5)) {
        console.log(
            `   doc=${t.docCod}/${t.titCod} credor="${t.credor}" → EXset.has=${ex.has(t.docCod)} isDoc=${await sispag.isDocInternacional(FIL, t.docCod)}`,
        );
    }

    // 3) quantos dos títulos fin064 batem no set EX
    const casam = titulos.filter((t) => ex.has(t.docCod)).length;
    console.log(`[probe4] títulos fin064=${titulos.length}, batem no EX=${casam}`);

    // 4) raw com298 EX — ver o formato do docCod devolvido
    const raw = await base.listGenericPaginated<Record<string, unknown>>(
        'com298/list',
        {
            fieldList: ['docCod', 'ufEspSigla', 'dpeNomPessoa'],
            filterList: { 'vldStatus#IN': ['1', '3'], 'ufEspSigla#LIKE': 'EX' },
            serviceName: 'com298',
            pageNumber: 1,
            pageSize: 10,
        },
        { filCod: FIL },
    );
    console.log('[probe4] raw com298 EX sample:', JSON.stringify(raw.rows.slice(0, 5)));
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[probe4] FATAL:', e instanceof Error ? e.message : String(e));
        process.exit(1);
    });
