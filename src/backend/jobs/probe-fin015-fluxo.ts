import 'reflect-metadata';
import { container } from 'tsyringe';
import ConexosBaseClient from '../domain/client/ConexosBaseClient.js';
import { bootstrapAppContainer } from '../domain/appContainer.js';

/**
 * FLUXO COMPLETO fin015 em HML: criar lote → importar título → finalizar → gerar `.REM`.
 * Guard anti-PRD. Escrita só com PROBE_WRITE=1.
 */
const BASE = process.env.CONEXOS_BASE_URL ?? '';
if (!BASE.includes('-hml')) {
    console.error(`RECUSADO: base não é HML (${BASE}).`);
    process.exit(1);
}
const FIL = 1;
const BNC = 4; // Itaú

async function main(): Promise<void> {
    await bootstrapAppContainer();
    const c = container.resolve(ConexosBaseClient);
    await c.ensureSid();
    const log = (s: string, v?: unknown) =>
        console.log(`[fluxo] ${s}`, v !== undefined ? JSON.stringify(v).slice(0, 500) : '');

    if (process.env.PROBE_WRITE !== '1') {
        log('READ-ONLY (PROBE_WRITE!=1). Fim.');
        return;
    }

    // ===== 1) CRIAR LOTE (POST /fin015) — conta Itaú 55795-4, data débito em [hoje, 13/08] =====
    const dataDebito = Date.parse('2026-07-20T00:00:00Z');
    const novoLote = {
        filCod: FIL,
        bncCod: BNC,
        bncNumCodbanco: 341,
        ccoCod: 1,
        ccoNumConta: 55795,
        ccoEspDvconta: '4',
        ccoEspAgcod: '0641',
        ccoEspDvage: null,
        conta: '55795-4',
        agencia: '-',
        layoutConta: 'AG:0641/CT:55795-4',
        flpDtaCredito: dataDebito,
        flpVldStatus: 0,
        flpVldConfEnvio: 0,
        flpVldRet: 0,
    };
    let flp: number | undefined;
    try {
        const res = await c.postGeneric<Record<string, unknown>>('fin015', novoLote, {
            filCod: FIL,
        });
        log('1) criar lote OK →', res);
        flp = Number(res.flpCod ?? (res.data as Record<string, unknown>)?.flpCod);
    } catch (e) {
        log('1) criar lote ERRO:', e instanceof Error ? e.message : String(e));
    }
    // fallback: pega o maior flpCod EM CADASTRO da conta (o recém-criado).
    if (!flp || Number.isNaN(flp)) {
        const lst = await c.listGenericPaginated<Record<string, unknown>>(
            'fin015/list',
            {
                fieldList: [],
                filterList: { bncCod: BNC, 'flpVldStatus#EQ': 0 },
                serviceName: 'fin015',
                pageNumber: 1,
                pageSize: 50,
            },
            { filCod: FIL },
        );
        flp = Math.max(...lst.rows.map((r) => Number(r.flpCod)).filter((n) => !Number.isNaN(n)));
        log('1b) flpCod recém-criado (maior CADASTRO) =', flp);
    }
    if (!flp) {
        log('sem flpCod — aborta.');
        return;
    }

    // ===== 2) LISTAR pendente doc 520 + IMPORTAR =====
    const pend = await c.listGenericPaginated<Record<string, unknown>>(
        `fin015/finItemSispag/titulosPendentes/list/${FIL}/${BNC}/${flp}`,
        {
            fieldList: [],
            filterList: { 'docCod#EQ': 520 },
            serviceName: 'fin015',
            pageNumber: 1,
            pageSize: 5,
        },
        { filCod: FIL },
    );
    log('2) pendente doc520 count=', pend.count);
    const alvo = pend.rows[0];
    if (!alvo) {
        log('doc 520 não veio como pendente (talvez já em lote) — aborta import.');
    } else {
        // tenta importar: 1º como array de linhas (bulk), 2º como {list:[...]}.
        const tentativas: Array<{ nome: string; body: unknown }> = [
            { nome: 'array', body: [alvo] },
            { nome: 'obj.list', body: { list: [alvo] } },
            { nome: 'obj.titulos', body: { titulos: [alvo] } },
        ];
        for (const t of tentativas) {
            try {
                const res = await c.postGeneric<unknown>(
                    'fin015/finItemSispag/titulosPendentes/importar',
                    t.body as Record<string, unknown>,
                    { filCod: FIL },
                );
                log(`2) importar (${t.nome}) OK →`, res);
                break;
            } catch (e) {
                log(`2) importar (${t.nome}) ERRO:`, e instanceof Error ? e.message : String(e));
            }
        }
    }

    // ===== 3) FINALIZAR (GET finalizarLote) =====
    try {
        const res = await c.getGeneric<unknown>(`fin015/finalizarLote/${FIL}/${BNC}/${flp}`, {
            filCod: FIL,
        });
        log('3) finalizar OK →', res);
    } catch (e) {
        log('3) finalizar ERRO:', e instanceof Error ? e.message : String(e));
    }

    // ===== 4) GERAR REMESSA =====
    try {
        const res = await c.postGeneric<unknown>(
            'fin015/gerArquivosBancos/gerarRemessa',
            {
                filCodLote: FIL,
                bncCod: BNC,
                flpCod: flp,
                grbCodSeq: 1,
                seqNum: 77,
                gabEspNomeArquivo: 'PG090777.REM',
            },
            { filCod: FIL },
        );
        log('4) gerarRemessa OK →', res);
    } catch (e) {
        log('4) gerarRemessa ERRO:', e instanceof Error ? e.message : String(e));
    }
    log(`FIM — lote criado flp=${flp}`);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[fluxo] FATAL:', e instanceof Error ? e.message : String(e));
        process.exit(1);
    });
