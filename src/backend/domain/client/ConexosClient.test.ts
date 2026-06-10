import 'reflect-metadata';
import ConexosClient, { type LegacyConexosShape } from './ConexosClient.js';
import ConexosError from '../errors/ConexosError.js';

const buildLegacy = (): jest.Mocked<LegacyConexosShape> => ({
    ensureSid: jest.fn().mockResolvedValue(undefined),
    listGeneric: jest.fn(),
    listGenericPaginated: jest.fn().mockResolvedValue({ count: 0, rows: [] }),
    getGeneric: jest.fn().mockResolvedValue({ rows: [] }),
    getEncargosGeraisByInvoice: jest.fn(),
    getFiliais: jest.fn().mockResolvedValue([]),
    getFilCodDefault: jest.fn().mockResolvedValue(null),
});

describe('ConexosClient', () => {
    describe('listFinanceiroAPagar', () => {
        it('chunks priCods in batches of 50 and aggregates', async () => {
            const legacy = buildLegacy();
            const priCods = Array.from({ length: 120 }, (_, i) => `P${i + 1}`);
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [
                    {
                        docCod: 'D1',
                        priCod: 'P1',
                        dataEmissao: '2026-04-01',
                        valor: 1000,
                        moeda: 'USD',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const result = await client.listFinanceiroAPagar({
                priCods,
                docTip: 'INVOICE',
                filCod: 2,
            });

            // 120 / 50 = 3 chunks; each chunk's loop terminates on first short page
            expect(legacy.listGenericPaginated).toHaveBeenCalledTimes(3);
            expect(result.invoices).toHaveLength(3); // one row per chunk
            expect(result.proformas).toEqual([]);
        });

        it('sends tpdCod#EQ=99 filter for PROFORMA', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listFinanceiroAPagar({
                priCods: ['P1', 'P2'],
                docTip: 'PROFORMA',
                filCod: 2,
            });

            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList['tpdCod#EQ']).toBe(99);
            expect(filterList['priCod#IN']).toEqual(['P1', 'P2']);
        });

        it('sends tpdCod#EQ=128 filter for INVOICE', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listFinanceiroAPagar({
                priCods: ['P1'],
                docTip: 'INVOICE',
                filCod: 2,
            });

            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList['tpdCod#EQ']).toBe(128);
        });

        it('maps docMnyValor → valor and dpeNomPessoa → exportador, extracts pago from mnyTitAberto', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 2,
                rows: [
                    {
                        docCod: 5974,
                        priCod: 1153,
                        docDtaEmissao: 1767571200000,
                        docMnyValor: 723094.81,
                        dpeNomPessoa: 'MLTI PRIVATE LIMITED',
                        mnyTitAberto: 0,
                    },
                    {
                        docCod: 5975,
                        priCod: 1154,
                        docDtaEmissao: 1767571200000,
                        docMnyValor: 100,
                        dpeNomPessoa: 'OTHER EXPORTER',
                        mnyTitAberto: 50,
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const { invoices } = await client.listFinanceiroAPagar({
                priCods: ['1153', '1154'],
                docTip: 'INVOICE',
                filCod: 2,
            });

            expect(invoices).toHaveLength(2);
            expect(invoices[0]).toMatchObject({
                docCod: '5974',
                priCod: '1153',
                valor: 723094.81,
                exportador: 'MLTI PRIVATE LIMITED',
                pago: true,
            });
            expect(invoices[1].pago).toBe(false);
        });

        it('paginates within a chunk until a short page is returned', async () => {
            const legacy = buildLegacy();
            const fullPage = Array.from({ length: 500 }, (_, i) => ({
                docCod: `D${i + 1}`,
                priCod: 'P1',
                docMnyValor: 1,
                dpeNomPessoa: 'EXP',
                mnyTitAberto: 0,
            }));
            const tailPage = Array.from({ length: 200 }, (_, i) => ({
                docCod: `D${500 + i + 1}`,
                priCod: 'P1',
                docMnyValor: 1,
                dpeNomPessoa: 'EXP',
                mnyTitAberto: 0,
            }));
            legacy.listGenericPaginated
                .mockResolvedValueOnce({ count: 700, rows: fullPage })
                .mockResolvedValueOnce({ count: 700, rows: tailPage });
            const client = new ConexosClient(legacy);

            const { invoices } = await client.listFinanceiroAPagar({
                priCods: ['P1'],
                docTip: 'INVOICE',
                filCod: 2,
            });

            expect(legacy.listGenericPaginated).toHaveBeenCalledTimes(2);
            expect(invoices).toHaveLength(700);
            // pageNumber should advance.
            const firstBody = legacy.listGenericPaginated.mock.calls[0][1] as Record<
                string,
                unknown
            >;
            const secondBody = legacy.listGenericPaginated.mock.calls[1][1] as Record<
                string,
                unknown
            >;
            expect(firstBody.pageNumber).toBe(1);
            expect(secondBody.pageNumber).toBe(2);
            expect(firstBody.pageSize).toBe(500);
        });
    });

    describe('listBaixasTitulo (POST com308/financeiroAPagar/baixas/list)', () => {
        it('parses borDtaMvto and sends canonical filter body', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMvto: '2026-04-15', bxaMnyLiquido: 500 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTitulo({ docCod: 'D1', titCod: 'T1', filCod: 2 });
            expect(out).toHaveLength(1);
            expect(out[0].borDtaMvto).toBeInstanceOf(Date);
            expect(out[0].valor).toBe(500);

            // Empty body triggers Conexos 400 NotNull — must include filterList
            // borVldFinalizado and orderList.
            const [path, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('com308/financeiroAPagar/baixas/list/D1/T1/0');
            expect(body).toMatchObject({
                filterList: { 'borVldFinalizado#IN': [1] },
                orderList: { orderList: [{ propertyName: 'borCod', order: 'asc' }] },
            });
            expect(opts).toEqual({ filCod: 2 });
        });

        // Addendum 2026-06-08 #1 (vc-multi-titulo): `bxaMnyValor` (principal BRL
        // @ câmbio de contrato) é exposto como campo DEDICADO, independente do
        // coalesce `valor` (que prioriza o líquido). Insumo do saldo residual
        // sobre o principal. Wire row onde principal ≠ líquido (desconto).
        it('expõe bxaMnyValor (principal) independente de bxaMnyLiquido (líquido)', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                // principal 1000; líquido 968 (= 1000 − R$32 de desconto).
                rows: [{ borDtaMvto: '2026-04-15', bxaMnyValor: 1000, bxaMnyLiquido: 968 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTitulo({ docCod: 'D1', titCod: '7', filCod: 2 });
            expect(out).toHaveLength(1);
            // Campo dedicado = principal (1000), NÃO o líquido (968).
            expect(out[0].bxaMnyValor).toBe(1000);
            // `valor` legacy coalesce: na ausência de `valor`/`borVlrMvto`, cai
            // no líquido (968) — comportamento preservado p/ outros callers.
            expect(out[0].valor).toBe(968);

            // titCod arbitrário é forwarded no path (per-título, sem hardcode 1).
            const [path] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('com308/financeiroAPagar/baixas/list/D1/7/0');
        });

        // Defensivo (watchlist Addendum 2026-06-08 #1): baixa com bxaMnyValor
        // ausente → default 0 (nunca soma null em pagoBRL).
        it('bxaMnyValor ausente → 0 (default defensivo)', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMvto: '2026-04-15', bxaMnyLiquido: 500 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTitulo({ docCod: 'D1', titCod: '1', filCod: 2 });
            expect(out[0].bxaMnyValor).toBe(0);
        });
    });

    describe('getEncargosGerais', () => {
        it('returns despesas from legacy response', async () => {
            const legacy = buildLegacy();
            legacy.getEncargosGeraisByInvoice.mockResolvedValue({
                despesas: [{ ctpDesNome: 'ENCARGOS FINANCEIROS', vlr: 250 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.getEncargosGerais({ docTip: 1, docCod: 100, filCod: 2 });
            expect(out.despesas).toHaveLength(1);
            expect(out.despesas[0].ctpDesNome).toBe('ENCARGOS FINANCEIROS');
        });

        it('returns empty array when legacy returns null', async () => {
            const legacy = buildLegacy();
            legacy.getEncargosGeraisByInvoice.mockResolvedValue(null);
            const client = new ConexosClient(legacy);

            const out = await client.getEncargosGerais({ docTip: 1, docCod: 100, filCod: 2 });
            expect(out.despesas).toEqual([]);
        });

        it('normalises Conexos wire field `dppMnyValorMn` to canonical `vlr`', async () => {
            // The real com017/encargosGerais payload returns the value under
            // `dppMnyValorMn` (full-base smoke confirmed against docCod=7072).
            // The pre-existing mapper ignored that field, so 154 processes
            // returned `delta=null` because `vlr` was undefined → NaN.
            const legacy = buildLegacy();
            legacy.getEncargosGeraisByInvoice.mockResolvedValue({
                despesas: [
                    { ctpDesNome: 'ENCARGOS FINANCEIROS', dppMnyValorMn: 837.37 },
                    { ctpDesNome: 'OUTRAS DESPESAS - FOB', dppMnyValorMn: 0 },
                    // Legacy shape still works for compat with old mocks.
                    { ctpDesNome: 'AFRMM', vlr: 100 },
                ],
            });
            const client = new ConexosClient(legacy);

            const out = await client.getEncargosGerais({ docTip: 1, docCod: 7072, filCod: 2 });
            expect(out.despesas).toEqual([
                { ctpDesNome: 'ENCARGOS FINANCEIROS', vlr: 837.37 },
                { ctpDesNome: 'OUTRAS DESPESAS - FOB', vlr: 0 },
                { ctpDesNome: 'AFRMM', vlr: 100 },
            ]);
        });
    });

    describe('listProcessos', () => {
        it('with no priCods sends canonical body shape and forwards filCod opt', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listProcessos({ filCod: 7 });

            expect(legacy.listGenericPaginated).toHaveBeenCalledTimes(1);
            const [endpoint, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            // The 1st arg is the URL path the adapter uses to build the
            // request (`/imp021/list`); the body-field `serviceName` is a
            // distinct request payload concern.
            expect(endpoint).toBe('imp021/list');

            // Canonical Conexos body shape — must match legacy `getProcesses`.
            // pageNumber/pageSize injected by the paginate helper, not by callers.
            // v0.5: fieldList is now explicit so pesCod and priEspRefcliente
            // come back from imp021 (default `[]` was omitting them).
            // Addendum 2026-06-08 #2: `priVldTipo` added for the "Und. Negócio"
            // column of the Variação Cambial report.
            expect(body).toEqual({
                fieldList: [
                    'priCod',
                    'pesCod',
                    'priEspRefcliente',
                    'priVldTipo',
                    'dpeNomPessoa',
                    'priDtaAbertura',
                    'filCod',
                ],
                filterList: { 'priVldStatus#IN': ['1'] },
                pageNumber: 1,
                pageSize: 500,
                serviceName: 'imp021',
                orderList: { orderList: [{ propertyName: 'priCod', order: 'asc' }] },
            });

            // Bug 1 regression — filCod must NOT leak into the body.
            const bodyRecord = body as Record<string, unknown>;
            expect(bodyRecord.filCod).toBeUndefined();
            expect(bodyRecord.page).toBeUndefined();

            // Bug 2 regression — filCod must travel via opts to the adapter.
            expect(opts).toEqual({ filCod: 7 });
        });

        it('with no priCods paginates until a short page is returned', async () => {
            const legacy = buildLegacy();
            const fullPage = Array.from({ length: 500 }, (_, i) => ({ priCod: i + 1 }));
            const partialPage = Array.from({ length: 26 }, (_, i) => ({ priCod: 500 + i + 1 }));
            legacy.listGenericPaginated
                .mockResolvedValueOnce({ count: 526, rows: fullPage })
                .mockResolvedValueOnce({ count: 526, rows: partialPage });
            const client = new ConexosClient(legacy);

            const out = await client.listProcessos({ filCod: 2 });

            expect(legacy.listGenericPaginated).toHaveBeenCalledTimes(2);
            expect(out).toHaveLength(526);
            const pageNumbers = legacy.listGenericPaginated.mock.calls.map(
                (call) => (call[1] as Record<string, unknown>).pageNumber,
            );
            expect(pageNumbers).toEqual([1, 2]);
        });

        it('with no priCods stops when accumulated rows reach reported count', async () => {
            const legacy = buildLegacy();
            // count=500 even though the server returns a full page → loop must stop
            // on the next iteration without making a third call (it makes a 2nd to
            // discover < pageSize OR count cap; whichever fires first ends loop).
            legacy.listGenericPaginated.mockResolvedValueOnce({
                count: 500,
                rows: Array.from({ length: 500 }, (_, i) => ({ priCod: i + 1 })),
            });
            const client = new ConexosClient(legacy);

            const out = await client.listProcessos({ filCod: 2 });

            // Single call: rows.length === pageSize but accumulated >= count → stop.
            expect(legacy.listGenericPaginated).toHaveBeenCalledTimes(1);
            expect(out).toHaveLength(500);
        });

        it('with priCods chunks the batches and forwards filCod opt on every chunk', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);
            const priCods = Array.from({ length: 75 }, (_, i) => `P${i + 1}`);

            await client.listProcessos({ filCod: 3, priCods });

            // 75 / 50 = 2 chunks; each chunk paginates and stops on first empty page.
            expect(legacy.listGenericPaginated).toHaveBeenCalledTimes(2);
            for (const call of legacy.listGenericPaginated.mock.calls) {
                const [, , opts] = call;
                expect(opts).toEqual({ filCod: 3 });
            }
        });

        // imp021's row carries the cliente importador under the canonical
        // Conexos field `dpeNomPessoa` (verified against the legacy
        // `routes/processes.ts:24` mapping which ships in production today).
        // A literal `importador` key does not exist on imp021 — relying on
        // it leaves every linha with importador=undefined.
        it('maps dpeNomPessoa → importador when no literal importador field is present', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValueOnce({
                count: 1,
                rows: [
                    {
                        priCod: 1153,
                        dpeNomPessoa: 'COLUMBIA TRADING CLIENT XYZ',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listProcessos({ filCod: 2 });

            expect(out).toHaveLength(1);
            expect(out[0]).toMatchObject({
                priCod: '1153',
                importador: 'COLUMBIA TRADING CLIENT XYZ',
            });
        });

        it('prefers literal importador over dpeNomPessoa when both are present', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValueOnce({
                count: 1,
                rows: [
                    {
                        priCod: 1,
                        importador: 'EXPLICIT IMPORTER',
                        dpeNomPessoa: 'FALLBACK NAME',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listProcessos({ filCod: 2 });

            expect(out[0].importador).toBe('EXPLICIT IMPORTER');
        });

        it('leaves importador undefined when neither importador nor dpeNomPessoa is present', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValueOnce({
                count: 1,
                rows: [{ priCod: 9 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listProcessos({ filCod: 2 });

            expect(out[0].importador).toBeUndefined();
        });

        // v0.5 (G2): pesCod and priEspRefcliente must be mapped explicitly so
        // the `nf-saida-mesmo-pescod-do-processo` filter (G3) and the
        // canonical "Ref. Externa" column (G4) have the data they need.
        it('maps pesCod and priEspRefcliente from imp021 row (string-cast)', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValueOnce({
                count: 1,
                rows: [
                    {
                        priCod: 1153,
                        pesCod: 1234,
                        priEspRefcliente: 'PO-2026-0042',
                        priVldTipo: 3,
                        dpeNomPessoa: 'IMPORTER A',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listProcessos({ filCod: 2 });

            expect(out[0]).toMatchObject({
                priCod: '1153',
                pesCod: '1234',
                priEspRefcliente: 'PO-2026-0042',
                // Addendum 2026-06-08 #2: priVldTipo coerced to number.
                priVldTipo: 3,
            });
        });

        it('leaves priEspRefcliente/priVldTipo undefined when missing from row, defaults pesCod to ""', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValueOnce({
                count: 1,
                rows: [{ priCod: 1 }], // no pesCod, no priEspRefcliente, no priVldTipo
            });
            const client = new ConexosClient(legacy);

            const out = await client.listProcessos({ filCod: 2 });
            expect(out[0].pesCod).toBe('');
            expect(out[0].priEspRefcliente).toBeUndefined();
            expect(out[0].priVldTipo).toBeUndefined();
        });
    });

    describe('legacyConexosAdapter.listGeneric', () => {
        it('forwards filCod opt to conexosService.authenticatedPost', async () => {
            const authenticatedPost = jest.fn().mockResolvedValue({ rows: [] });
            jest.doMock('../../services/conexos.js', () => ({
                conexosService: {
                    ensureSid: jest.fn().mockResolvedValue(undefined),
                    getFiliais: jest.fn().mockResolvedValue([]),
                    getFilCodDefault: jest.fn().mockResolvedValue(null),
                    getSid: jest.fn().mockResolvedValue({ sid: 's', usnCod: '97' }),
                    authenticatedPost,
                    authenticatedGet: jest.fn().mockResolvedValue({ rows: [] }),
                    getEncargosGeraisByInvoice: jest.fn().mockResolvedValue(null),
                },
            }));

            // Late require to honour jest.doMock.
            const { buildLegacyConexosAdapter } = await import('./legacyConexosAdapter.js');
            const adapter = await buildLegacyConexosAdapter({
                conexosBaseUrl: 'http://x',
                conexosUsername: 'u',
                conexosPassword: 'p',
                filCod: 1,
            });

            await adapter.listGeneric<unknown[]>('imp021/list', { fieldList: [] }, { filCod: 9 });

            expect(authenticatedPost).toHaveBeenCalledWith(
                '/imp021/list',
                { fieldList: [] },
                { filCod: 9 },
            );

            jest.dontMock('../../services/conexos.js');
        });
    });

    describe('listNFsSaida', () => {
        it('sends vldStatus#IN filter and maps docMnyValor to valor', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValueOnce({
                count: 1,
                rows: [
                    {
                        docCod: 6141,
                        priCod: 197,
                        pesCod: 1234,
                        docDtaEmissao: 1730000000000,
                        docMnyValor: 473893.5,
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listNFsSaida({ priCods: ['197'], filCod: 2 });

            expect(out).toHaveLength(1);
            expect(out[0]).toMatchObject({
                docCod: '6141',
                priCod: '197',
                pesCod: '1234',
                valor: 473893.5,
            });

            // FINALIZADO-only filter: Yuri 2026-05-07 ruled that the
            // closing report must consume only com297 NFs saída with
            // `vldStatus = 3` (finalizadas). Earlier wider filter was
            // a probe artefact and is no longer in scope.
            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList['vldStatus#IN']).toEqual(['3']);
            expect(filterList['priCod#IN']).toEqual(['197']);
        });

        // v0.5 (G2): explicit fieldList ensures pesCod is returned. Default
        // `[]` omitted it, breaking G3 (`nf-saida-mesmo-pescod-do-processo`).
        it('sends explicit fieldList including pesCod', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValueOnce({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listNFsSaida({ priCods: ['197'], filCod: 2 });

            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const fieldList = body.fieldList as string[];
            expect(fieldList).toContain('pesCod');
            expect(fieldList).toContain('docCod');
            expect(fieldList).toContain('priCod');
            expect(fieldList).toContain('docMnyValor');
        });

        it('defensively defaults pesCod to "" when missing from the row', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValueOnce({
                count: 1,
                rows: [{ docCod: 1, priCod: 1, docMnyValor: 0 }], // no pesCod
            });
            const client = new ConexosClient(legacy);

            const out = await client.listNFsSaida({ priCods: ['1'], filCod: 2 });
            expect(out[0].pesCod).toBe('');
        });
    });

    describe('FINALIZADO filter (vldStatus = 3)', () => {
        it("listFinanceiroAPagar sends vldStatus#IN: ['3'] in body", async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listFinanceiroAPagar({
                priCods: ['P1'],
                docTip: 'INVOICE',
                filCod: 2,
            });

            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList['vldStatus#IN']).toEqual(['3']);
        });

        it("listFinanceiroAReceber sends vldStatus#IN: ['3'] in body", async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listFinanceiroAReceber({ priCods: ['P1'], filCod: 2 });

            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList['vldStatus#IN']).toEqual(['3']);
        });
    });

    describe('listBaixasSolNum (POST com309/baixas/list)', () => {
        it('routes through com309, parses borDtaMvto, sends canonical body', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMvto: '2026-04-20', bxaMnyLiquido: 700 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasSolNum({ docCod: 'D9', filCod: 4 });

            expect(out).toHaveLength(1);
            expect(out[0].borDtaMvto).toBeInstanceOf(Date);
            expect(out[0].borDtaMvto.toISOString().slice(0, 10)).toBe('2026-04-20');
            expect(out[0].valor).toBe(700);

            // ⚠ com309 family — NOT com308/financeiroAReceber. The earlier
            // path was an incorrect guess; com309 is the canonical SolNum
            // baixa endpoint per Conexos portal payload.
            const [path, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('com309/baixas/list/D9/1/0');
            expect(body).toMatchObject({
                filterList: { 'borVldFinalizado#IN': [1] },
                orderList: { orderList: [{ propertyName: 'borCod', order: 'asc' }] },
            });
            expect(opts).toEqual({ filCod: 4 });
        });

        it('returns empty list when no baixas (sem dataBaixa)', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasSolNum({ docCod: 'D9', filCod: 2 });
            expect(out).toEqual([]);
        });
    });

    describe('listTitulosNFSaida (POST com311/list/<docCod>, serviceName=com311.finTituloFin)', () => {
        it('replicates docCod=6428 → 6 títulos all paid', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 6,
                rows: Array.from({ length: 6 }, (_, i) => ({
                    filCod: 2,
                    docCod: 6428,
                    titCod: i + 1,
                    titEspNumero: String(i + 1),
                    titDtaVencimento: '2026-03-15',
                    titMnyValor: 84500,
                    titMnyTotPago: 84500,
                    pago: 1,
                })),
            });
            const client = new ConexosClient(legacy);

            const out = await client.listTitulosNFSaida({ docCod: '6428', filCod: 2 });

            expect(out).toHaveLength(6);
            for (let i = 0; i < 6; i++) {
                expect(out[i].titCod).toBe(String(i + 1));
                expect(out[i].parcela).toBe(i + 1);
                expect(out[i].pago).toBe(true);
                expect(out[i].valor).toBe(84500);
            }

            // ⚠ POST with docCod IN PATH and serviceName MUST be the
            // qualified `com311.finTituloFin`; without the suffix Conexos
            // returns 405. filCod travels via opts.
            const [path, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('com311/list/6428');
            expect(body).toMatchObject({
                serviceName: 'com311.finTituloFin',
                filterList: { 'titVldStatus#EQ': '1' },
            });
            expect(opts).toEqual({ filCod: 2 });
        });

        it('returns empty list when Conexos returns no rows', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            const out = await client.listTitulosNFSaida({ docCod: '999', filCod: 7 });
            expect(out).toEqual([]);
        });

        it('falls back to titCod when titEspNumero missing', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ filCod: 2, docCod: 1, titCod: 3, titMnyValor: 10, pago: 0 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listTitulosNFSaida({ docCod: '1', filCod: 2 });
            expect(out[0].parcela).toBe(3);
            expect(out[0].pago).toBe(false);
        });
    });

    describe('listBaixasTituloNFSaida (POST com311/baixas/list)', () => {
        it('parses borDtaMvto (canonical) — confirmed against Conexos portal payload', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMvto: 1768521600000, bxaMnyLiquido: 84500 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTituloNFSaida({
                docCod: '6428',
                titCod: '1',
                filCod: 2,
            });

            expect(out).toHaveLength(1);
            expect(out[0].borDtaMovimento).toBeInstanceOf(Date);
            expect(out[0].borDtaMovimento.toISOString().slice(0, 10)).toBe('2026-01-16');
            expect(out[0].valor).toBe(84500);
        });

        it('falls back to legacy borDtaMovimento name when borDtaMvto missing', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMovimento: '2026-04-15', bxaMnyLiquido: 100 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTituloNFSaida({
                docCod: '6428',
                titCod: '1',
                filCod: 2,
            });
            expect(out[0].borDtaMovimento.toISOString().slice(0, 10)).toBe('2026-04-15');
        });

        it('builds the canonical 3-segment path /<docCod>/<titCod>/<vldCheck=0> with borVldFinalizado filter', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listBaixasTituloNFSaida({
                docCod: '6428',
                titCod: '4',
                filCod: 2,
            });

            const [path, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('com311/baixas/list/6428/4/0');
            expect(body).toMatchObject({
                filterList: { 'borVldFinalizado#IN': [1] },
                orderList: { orderList: [{ propertyName: 'borCod', order: 'asc' }] },
            });
            expect(opts).toEqual({ filCod: 2 });
        });

        it('returns empty list when nothing baixado yet', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTituloNFSaida({
                docCod: '6428',
                titCod: '6',
                filCod: 2,
            });
            expect(out).toEqual([]);
        });

        it('wraps Conexos failure in ConexosError with the 3-segment endpoint', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('502'));
            const client = new ConexosClient(legacy);

            try {
                await client.listBaixasTituloNFSaida({
                    docCod: '6428',
                    titCod: '1',
                    filCod: 2,
                });
                fail('expected ConexosError');
            } catch (err) {
                expect(err).toBeInstanceOf(ConexosError);
                expect((err as ConexosError).endpoint).toBe('com311/baixas/list/6428/1/0');
            }
        });
    });

    describe('error handling', () => {
        it('retries failed call once then succeeds', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated
                .mockRejectedValueOnce(new Error('500'))
                .mockResolvedValueOnce({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await expect(client.listNFsSaida({ priCods: ['P1'], filCod: 2 })).resolves.toEqual([]);
            expect(legacy.listGenericPaginated).toHaveBeenCalledTimes(2);
        });

        it('wraps exhausted retry in ConexosError with endpoint info', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('502'));
            const client = new ConexosClient(legacy);

            try {
                await client.listNFsSaida({ priCods: ['P1'], filCod: 2 });
                fail('expected ConexosError');
            } catch (err) {
                expect(err).toBeInstanceOf(ConexosError);
                const ce = err as ConexosError;
                expect(ce.endpoint).toBe('com297/list');
                expect(ce.priCod).toBe('P1');
            }
        });
    });

    // ------------------------------------------------------------------
    // parseDate timezone handling
    // ------------------------------------------------------------------
    // Conexos encodes dates as "midnight UTC of the calendar day in BR".
    // A naive `new Date(ms)` lands on 00:00 UTC, which renders as the
    // PREVIOUS day in BR (UTC-3). We shift numeric timestamps to 15:00 UTC
    // (= 12:00 BRT) so the wall-clock day matches the Conexos portal in
    // any timezone within UTC ± 12h, regardless of formatting locale.
    describe('parseDate (timezone-safe handling of Conexos timestamps)', () => {
        it('numeric timestamp 1768780800000 (Conexos "19/01/2026") parses to calendar day 19 in BR', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMvto: 1768780800000, bxaMnyLiquido: 100 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTituloNFSaida({
                docCod: 'D1',
                titCod: 'T1',
                filCod: 2,
            });

            const d = out[0].borDtaMovimento;
            // BR wall-clock day must be 19 (matches Conexos portal display).
            expect(d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })).toBe(
                '19/01/2026',
            );
            // ISO slice should also report the same calendar day, not a day before.
            expect(d.toISOString().slice(0, 10)).toBe('2026-01-19');
        });

        it('numeric timestamp 1768521600000 (Conexos "16/01/2026") parses to calendar day 16 in BR', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMvto: 1768521600000, bxaMnyLiquido: 100 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTituloNFSaida({
                docCod: 'D1',
                titCod: 'T1',
                filCod: 2,
            });

            const d = out[0].borDtaMovimento;
            expect(d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })).toBe(
                '16/01/2026',
            );
            expect(d.toISOString().slice(0, 10)).toBe('2026-01-16');
        });

        it('ISO date string is preserved as-is (no shift applied)', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMvto: '2026-04-15', bxaMnyLiquido: 100 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTitulo({
                docCod: 'D1',
                titCod: 'T1',
                filCod: 2,
            });

            // Same string-based behavior preserved: ISO slice still reports
            // the encoded day. No shift applied to string inputs (they are
            // already calendar-day-anchored at UTC midnight).
            expect(out[0].borDtaMvto.toISOString().slice(0, 10)).toBe('2026-04-15');
        });

        it('Date instance passes through unchanged', async () => {
            const legacy = buildLegacy();
            const fixed = new Date('2026-07-04T10:30:00.000Z');
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ borDtaMvto: fixed, bxaMnyLiquido: 100 }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listBaixasTitulo({
                docCod: 'D1',
                titCod: 'T1',
                filCod: 2,
            });

            expect(out[0].borDtaMvto.getTime()).toBe(fixed.getTime());
        });
    });

    // ──────────────────────────────────────────────────────────────────
    // AdiantamentoFinanceiro (v0.4 — `implantacao-saldo-financeiro`)
    //
    // Wire-field contract:
    //   - `tpdCod#EQ` numeric 143 (TPD_IMPLANTACAO_SALDO)
    //   - `gerNum#EQ` / `gerNum#IN`  (NOT `gerCod` — `FinDocCab` has no `gerCod`)
    //   - `vldStatus#IN ['3']`
    //
    // The 4 numeric IDs (143, 198, 210, 233) come from the empirical probe
    // documented in `ontology/_inbox/implantacao-saldo-financeiro-conexos-ids.md`.
    // ──────────────────────────────────────────────────────────────────

    describe('listAdiantamentoFinanceiroAPagar (com298, ADTO_FORN_INT débito)', () => {
        it('sends tpdCod#EQ 143 + gerNum#EQ 198 + vldStatus FINALIZADO', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listAdiantamentoFinanceiroAPagar({
                priCods: ['1153'],
                filCod: 2,
            });

            const [path, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('com298/list');
            const filterList = (body as Record<string, unknown>).filterList as Record<
                string,
                unknown
            >;
            // Critical: numeric IDs (Conexos rejects string IDs on numeric columns).
            // Yuri 2026-05-12: com298 (débito) tem DOIS planos financeiros para
            // IMPLANTAÇÃO DE SALDO — ADTO_FORN_INT (198) e ADTO_CLIENTE_NAC
            // (233, lado débito). Filtro mudou de `gerNum#EQ 198` para
            // `gerNum#IN [198, 233]`.
            expect(filterList['tpdCod#EQ']).toBe(143);
            expect(filterList['gerNum#IN']).toEqual([198, 233]);
            expect(filterList['vldStatus#IN']).toEqual(['3']);
            expect(filterList['priCod#IN']).toEqual(['1153']);
            expect(opts).toEqual({ filCod: 2 });
        });

        it('maps com298 rows to AdiantamentoFinanceiro (débito + ADTO_FORN_INT)', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 2,
                rows: [
                    {
                        docCod: 21291,
                        priCod: 1153,
                        docDtaEmissao: 1778112000000,
                        docMnyValor: 221265,
                        dpeNomPessoa: 'JINLING TRADE (HK) LIMITED',
                        gerNum: 198,
                        tpdCod: 143,
                        filCod: 2,
                        moeEspSigla: 'USD',
                    },
                    {
                        docCod: 21292,
                        priCod: 1153,
                        docDtaEmissao: 1778112000000,
                        docMnyValor: 10000,
                        dpeNomPessoa: 'OTHER FORN',
                        gerNum: 198,
                        tpdCod: 143,
                        filCod: 2,
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listAdiantamentoFinanceiroAPagar({
                priCods: ['1153'],
                filCod: 2,
            });

            expect(out).toHaveLength(2);
            expect(out[0]).toMatchObject({
                direcao: 'debito',
                tipo: 'ADTO_FORN_INT',
                docCod: '21291',
                priCod: '1153',
                valor: 221265,
                moeda: 'USD',
                filCod: 2,
                vldStatus: '3',
                pessoa: 'JINLING TRADE (HK) LIMITED',
            });
            expect(out[0].dataBaixa).toBeUndefined();
            expect(out[1].moeda).toBe('BRL'); // fallback default
        });

        it('returns empty array when no rows', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            const out = await client.listAdiantamentoFinanceiroAPagar({
                priCods: ['1153'],
                filCod: 2,
            });
            expect(out).toEqual([]);
        });

        it('returns empty array (no Conexos call) when priCods is empty', async () => {
            const legacy = buildLegacy();
            const client = new ConexosClient(legacy);

            const out = await client.listAdiantamentoFinanceiroAPagar({
                priCods: [],
                filCod: 2,
            });
            expect(out).toEqual([]);
            expect(legacy.listGenericPaginated).not.toHaveBeenCalled();
        });

        it('chunks priCods in batches of 50 and aggregates', async () => {
            const legacy = buildLegacy();
            const priCods = Array.from({ length: 75 }, (_, i) => `P${i + 1}`);
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listAdiantamentoFinanceiroAPagar({ priCods, filCod: 2 });

            // 75 / 50 = 2 chunks (50 + 25).
            expect(legacy.listGenericPaginated).toHaveBeenCalledTimes(2);
        });
    });

    describe('listAdiantamentoFinanceiroAReceber (com299, ADTO_CLIENTE_* crédito)', () => {
        it('sends tpdCod#EQ 143 + gerNum#IN [210, 233] (numeric array) + FINALIZADO', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listAdiantamentoFinanceiroAReceber({
                priCods: ['1153'],
                filCod: 2,
            });

            const [path, body] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('com299/list');
            const filterList = (body as Record<string, unknown>).filterList as Record<
                string,
                unknown
            >;
            expect(filterList['tpdCod#EQ']).toBe(143);
            // Critical: numeric IN (no string IDs); Conexos rejects '210' on
            // numeric columns.
            expect(filterList['gerNum#IN']).toEqual([210, 233]);
            expect(filterList['vldStatus#IN']).toEqual(['3']);
        });

        it('maps com299 rows to crédito side discriminated by gerNum', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 2,
                rows: [
                    {
                        docCod: 5001,
                        priCod: 1153,
                        docDtaEmissao: 1778500000000,
                        docMnyValor: 89800,
                        gerNum: 210,
                        tpdCod: 143,
                        filCod: 2,
                        dpeNomPessoa: 'CLIENTE EXTERIOR',
                    },
                    {
                        docCod: 5002,
                        priCod: 1153,
                        docDtaEmissao: 1778500000000,
                        docMnyValor: 50000,
                        gerNum: 233,
                        tpdCod: 143,
                        filCod: 2,
                        dpeNomPessoa: 'CLIENTE NACIONAL',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listAdiantamentoFinanceiroAReceber({
                priCods: ['1153'],
                filCod: 2,
            });

            expect(out).toHaveLength(2);
            expect(out[0]).toMatchObject({
                direcao: 'credito',
                tipo: 'ADTO_CLIENTE_EXT',
                docCod: '5001',
                valor: 89800,
            });
            expect(out[1]).toMatchObject({
                direcao: 'credito',
                tipo: 'ADTO_CLIENTE_NAC',
                docCod: '5002',
                valor: 50000,
            });
        });

        it("drops rows with unrecognized gerNum (defensive — shouldn't happen given filter)", async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 2,
                rows: [
                    { docCod: 9001, priCod: 1, gerNum: 210, docMnyValor: 100 },
                    { docCod: 9002, priCod: 1, gerNum: 999, docMnyValor: 100 }, // unknown
                ],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listAdiantamentoFinanceiroAReceber({
                priCods: ['1'],
                filCod: 2,
            });
            expect(out).toHaveLength(1);
            expect(out[0].docCod).toBe('9001');
        });

        it('returns empty array when no rows', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            const out = await client.listAdiantamentoFinanceiroAReceber({
                priCods: ['1'],
                filCod: 2,
            });
            expect(out).toEqual([]);
        });
    });

    // v0.5 — variacao-cambial (2026-05-28)
    describe('listTitulosAPagar — foreign-currency contracting fields', () => {
        it('populates valorNegociado/taxa/moedaCod/moedaNome from com308 wire fields (docCod=24107 sample)', async () => {
            const legacy = buildLegacy();
            legacy.listGeneric.mockResolvedValue([
                {
                    titCod: 1,
                    titFltTaxaMneg: 5.0211,
                    titMnyValorMneg: 75094,
                    moeCodMneg: 220,
                    moeEspNome: 'DOLAR DOS EUA',
                },
            ]);
            const client = new ConexosClient(legacy);

            const titles = await client.listTitulosAPagar({ docCod: '24107', filCod: 2 });

            expect(titles).toHaveLength(1);
            expect(titles[0].titCod).toBe('1');
            expect(titles[0].valorNegociado).toBe(75094);
            expect(titles[0].taxa).toBe(5.0211);
            expect(titles[0].moedaCod).toBe(220);
            expect(titles[0].moedaNome).toBe('DOLAR DOS EUA');
        });

        it('sends the extended fieldList including the four mneg fields', async () => {
            const legacy = buildLegacy();
            legacy.listGeneric.mockResolvedValue([]);
            const client = new ConexosClient(legacy);

            await client.listTitulosAPagar({ docCod: '24107', filCod: 2 });

            const body = legacy.listGeneric.mock.calls[0][1] as Record<string, unknown>;
            const fieldList = body.fieldList as string[];
            expect(fieldList).toEqual(
                expect.arrayContaining([
                    'titCod',
                    'titFltTaxaMneg',
                    'titMnyValorMneg',
                    'moeCodMneg',
                    'moeEspNome',
                ]),
            );
        });

        it('leaves optional fields undefined when Conexos omits them', async () => {
            const legacy = buildLegacy();
            legacy.listGeneric.mockResolvedValue([{ titCod: 1 }]);
            const client = new ConexosClient(legacy);

            const titles = await client.listTitulosAPagar({ docCod: '6074', filCod: 2 });

            expect(titles).toHaveLength(1);
            expect(titles[0].titCod).toBe('1');
            expect(titles[0].valorNegociado).toBeUndefined();
            expect(titles[0].taxa).toBeUndefined();
            expect(titles[0].moedaCod).toBeUndefined();
            expect(titles[0].moedaNome).toBeUndefined();
        });
    });

    // Addendum #10 ADR-0020 (2026-06-05) — `dpeNomPessoa` (destino do
    // pagamento do documento) vira campo DEDICADO de `DocFinanceiroAPagar`,
    // em vez de ser coalescido apenas dentro de `exportador`. A coluna
    // "Cliente" do relatório VC passa a vir desse campo. `exportador`
    // CONTINUA populado pelo coalesce existente (FM/JVE dependem).
    describe('listFinanceiroAPagarByGerNum — dpeNomPessoa dedicated field (Addendum #10)', () => {
        it('maps row.dpeNomPessoa to a dedicated dpeNomPessoa field', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [
                    {
                        docCod: 21841,
                        priCod: 1320,
                        docDtaEmissao: 1767571200000,
                        docMnyValor: 46538.58,
                        gerNum: 198,
                        gerDes: 'ADTO FORNECEDOR INTERNACIONAIS',
                        dpeNomPessoa: 'JINLING TRADE (HK) LIMITED',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const docs = await client.listFinanceiroAPagarByGerNum({
                priCods: ['1320'],
                gerNums: [198, 21, 276],
                filCod: 2,
            });

            expect(docs).toHaveLength(1);
            expect(docs[0].dpeNomPessoa).toBe('JINLING TRADE (HK) LIMITED');
        });

        it('regression: exportador STILL populated by existing coalesce (exportador ?? dpeNomPessoa) — FM/JVE depend on it', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 2,
                rows: [
                    {
                        docCod: 1,
                        priCod: 1,
                        gerNum: 21,
                        dpeNomPessoa: 'DESTINO DO PAGAMENTO',
                    },
                    {
                        docCod: 2,
                        priCod: 1,
                        gerNum: 21,
                        exportador: 'EXPORTADOR EXPLICITO',
                        dpeNomPessoa: 'DESTINO DO PAGAMENTO',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const docs = await client.listFinanceiroAPagarByGerNum({
                priCods: ['1'],
                gerNums: [21],
                filCod: 2,
            });

            // coalesce: when exportador absent, falls back to dpeNomPessoa
            expect(docs[0].exportador).toBe('DESTINO DO PAGAMENTO');
            // explicit exportador wins
            expect(docs[1].exportador).toBe('EXPORTADOR EXPLICITO');
            // dedicated dpeNomPessoa field independent of exportador
            expect(docs[0].dpeNomPessoa).toBe('DESTINO DO PAGAMENTO');
            expect(docs[1].dpeNomPessoa).toBe('DESTINO DO PAGAMENTO');
        });

        it('dpeNomPessoa absent/null → dedicated field undefined (service owns the "" normalization, D10f)', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [
                    {
                        docCod: 3,
                        priCod: 1,
                        gerNum: 21,
                        // no dpeNomPessoa, no exportador
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const docs = await client.listFinanceiroAPagarByGerNum({
                priCods: ['1'],
                gerNums: [21],
                filCod: 2,
            });

            expect(docs[0].dpeNomPessoa).toBeUndefined();
            expect(docs[0].exportador).toBeUndefined();
        });
    });

    describe('listLancamentosVC — Conta Contábil via com022 (Step B, lotEspSigla=VC)', () => {
        it('returns 2 rows (débito + crédito) for priCod=2566 interview sample', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 2,
                rows: [
                    {
                        ctbCod: 100,
                        priCod: 2566,
                        pesCod: 999,
                        plaNum: 1,
                        plaEspConta: '2.1.2.2.0001',
                        plaDesNome: 'FORNECEDORES - INTERNACIONAIS',
                        ctbMnyDebito: 675.85,
                        ctbMnyCredito: 0,
                        lotDtaData: 1779840000000,
                    },
                    {
                        ctbCod: 101,
                        priCod: 2566,
                        pesCod: 999,
                        plaNum: 2,
                        plaEspConta: '1.1.3.1.0004',
                        plaDesNome: 'ESTOQUE EM TRÂNSITO',
                        ctbMnyDebito: 0,
                        ctbMnyCredito: 675.85,
                        lotDtaData: 1779840000000,
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const lancs = await client.listLancamentosVC({
                priCod: '2566',
                filCod: 2,
                lotCod: 4,
                lotDtaData: 1779840000000,
            });

            expect(lancs).toHaveLength(2);
            expect(lancs[0].plaEspConta).toBe('2.1.2.2.0001');
            expect(lancs[0].plaDesNome).toBe('FORNECEDORES - INTERNACIONAIS');
            expect(lancs[0].ctbMnyDebito).toBe(675.85);
            expect(lancs[0].ctbMnyCredito).toBe(0);
            expect(lancs[0].priCod).toBe('2566');
            expect(lancs[1].plaEspConta).toBe('1.1.3.1.0004');
            expect(lancs[1].ctbMnyCredito).toBe(675.85);
            expect(lancs[1].ctbMnyDebito).toBe(0);
        });

        it('Addendum #6 — when lotEspSigla param omitted, filterList does NOT include lotEspSigla (agnostic lookup)', async () => {
            // Pré-Addendum #6: o método hardcodava lotEspSigla=VC, mesmo que o
            // caller não pedisse — fechava o lookup para lotes não-VC que
            // também carregam plaDesNome=FORNECEDORES INTERNACIONAIS.
            // Pós-Addendum #6: parâmetro opcional; quando ausente, NÃO é enviado.
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listLancamentosVC({
                priCod: '2566',
                filCod: 2,
                lotCod: 4,
                lotDtaData: 1779840000000,
            });

            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList.lotEspSigla).toBeUndefined();
            expect(filterList.priCod).toBe(2566);
            expect(filterList.lotCod).toBe(4);
            expect(filterList.lotDtaData).toBe(1779840000000);
            expect(body.serviceName).toBe('com022.ctbLancamentoCab');
        });

        it('Addendum #6 — when lotEspSigla=VC param passed explicitly, filterList includes it', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listLancamentosVC({
                priCod: '2566',
                filCod: 2,
                lotCod: 4,
                lotDtaData: 1779840000000,
                lotEspSigla: 'VC',
            });

            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList.lotEspSigla).toBe('VC');
        });

        it('Addendum #6 — when lotEspSigla=NE param passed, filterList includes it', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listLancamentosVC({
                priCod: '2566',
                filCod: 2,
                lotCod: 5,
                lotDtaData: 1779840000000,
                lotEspSigla: 'NE',
            });

            const body = legacy.listGenericPaginated.mock.calls[0][1] as Record<string, unknown>;
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList.lotEspSigla).toBe('NE');
        });

        it('returns empty array when Conexos returns no rows', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            const lancs = await client.listLancamentosVC({
                priCod: '9999',
                filCod: 2,
                lotCod: 4,
                lotDtaData: 1779840000000,
            });
            expect(lancs).toEqual([]);
        });

        it('rejects non-numeric priCod with ConexosError', async () => {
            const legacy = buildLegacy();
            const client = new ConexosClient(legacy);

            await expect(
                client.listLancamentosVC({
                    priCod: 'NOT_NUMERIC',
                    filCod: 2,
                    lotCod: 4,
                    lotDtaData: 1779840000000,
                }),
            ).rejects.toBeInstanceOf(ConexosError);
        });

        it('propagates ConexosError on transport failure', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('504 upstream'));
            const client = new ConexosClient(legacy);

            await expect(
                client.listLancamentosVC({
                    priCod: '2566',
                    filCod: 2,
                    lotCod: 4,
                    lotDtaData: 1779840000000,
                }),
            ).rejects.toBeInstanceOf(ConexosError);
        });
    });

    describe('listLancamentosContabeisLotes — Step A of Conta Contábil 2-step lookup', () => {
        it('hits POST com022/lancamentosContabeis/{filCod}/{docCod} with empty filter envelope', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listLancamentosContabeisLotes({ filCod: 2, docCod: '24107' });

            // listGenericPaginated is called with (endpointPath, body, opts).
            const call = legacy.listGenericPaginated.mock.calls[0];
            expect(call[0]).toBe('com022/lancamentosContabeis/2/24107');
            const body = call[1] as Record<string, unknown>;
            expect(body.fieldList).toEqual([]);
            expect(body.filterList).toEqual({});
            expect(body.serviceName).toBe('com022.ctbLancamentoCab');
            expect(body.orderList).toEqual({
                orderList: [{ propertyName: 'lotCod', order: 'asc' }],
            });
            const opts = call[2] as { filCod?: number } | undefined;
            expect(opts?.filCod).toBe(2);
        });

        it('returns mapped lotes (lotCod/lotDtaData/lotEspSigla) for docCod=24107 interview sample', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [
                    {
                        lotCod: 4,
                        lotDtaData: 1779840000000,
                        lotEspSigla: 'VC',
                        filCod: 2,
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const lotes = await client.listLancamentosContabeisLotes({
                filCod: 2,
                docCod: '24107',
            });

            expect(lotes).toEqual([
                { lotCod: 4, lotDtaData: 1779840000000, lotEspSigla: 'VC', filCod: 2 },
            ]);
        });

        it('returns empty array when no lotes exist for docCod', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            const lotes = await client.listLancamentosContabeisLotes({
                filCod: 2,
                docCod: '9999',
            });
            expect(lotes).toEqual([]);
        });

        it('propagates ConexosError on transport failure', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('504 upstream'));
            const client = new ConexosClient(legacy);

            await expect(
                client.listLancamentosContabeisLotes({ filCod: 2, docCod: '24107' }),
            ).rejects.toBeInstanceOf(ConexosError);
        });
    });

    // -----------------------------------------------------------------
    // cmn156 — currency index master + quotes (vc-moedas-cmn156,
    // ADR-0020 Addendum #12, 2026-06-07).
    // -----------------------------------------------------------------
    describe('listIndicesByIdent — cmn156 master (Rota 1)', () => {
        it('sends serviceName cmn156.CmnIndices + filter indEspIdent#IN and maps rows', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 2,
                rows: [
                    {
                        indCod: 32,
                        indEspIdent: '220',
                        indEspSigla: 'USD',
                        indDesNome: 'DOLAR DOS EUA',
                    },
                    {
                        indCod: 163,
                        indEspIdent: '978',
                        indEspSigla: 'EUR',
                        indDesNome: 'EURO',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const indices = await client.listIndicesByIdent({
                moeCodMnegs: ['220', '978'],
                filCod: 2,
            });

            const [endpoint, body] = legacy.listGenericPaginated.mock.calls[0] as [
                string,
                Record<string, unknown>,
            ];
            expect(endpoint).toBe('cmn156/list');
            expect(body.serviceName).toBe('cmn156.CmnIndices');
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList['indEspIdent#IN']).toEqual(['220', '978']);

            expect(indices).toHaveLength(2);
            expect(indices[0]).toEqual({
                indCod: '32',
                indEspIdent: '220',
                indEspSigla: 'USD',
                indDesNome: 'DOLAR DOS EUA',
            });
            expect(indices[1].indCod).toBe('163');
        });

        it('returns [] for an empty moeCodMnegs list without calling Conexos', async () => {
            const legacy = buildLegacy();
            const client = new ConexosClient(legacy);

            const indices = await client.listIndicesByIdent({ moeCodMnegs: [], filCod: 2 });

            expect(indices).toEqual([]);
            expect(legacy.listGenericPaginated).not.toHaveBeenCalled();
        });

        it('propagates ConexosError on transport failure', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('504 upstream'));
            const client = new ConexosClient(legacy);

            await expect(
                client.listIndicesByIdent({ moeCodMnegs: ['220'], filCod: 2 }),
            ).rejects.toBeInstanceOf(ConexosError);
        });
    });

    describe('listCotacoes — cmn156 quotes (Rota 2)', () => {
        it('sends serviceName cmn156.CmnIndicesCot + intVldStatus#IN + indCod#EQ + orderList desc', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await client.listCotacoes({ indCod: '32', filCod: 2 });

            const [endpoint, body] = legacy.listGenericPaginated.mock.calls[0] as [
                string,
                Record<string, unknown>,
            ];
            expect(endpoint).toBe('cmn156/CmnIndicesCot/list');
            expect(body.serviceName).toBe('cmn156.CmnIndicesCot');
            const filterList = body.filterList as Record<string, unknown>;
            expect(filterList['intVldStatus#IN']).toEqual(['1']);
            expect(filterList['indCod#EQ']).toBe('32');
            const orderList = body.orderList as { orderList: Array<Record<string, unknown>> };
            expect(orderList.orderList[0]).toEqual({
                propertyName: 'intDtaData',
                order: 'desc',
            });
        });

        it('maps intFltVenda (number) and intDtaData (Date via epoch-ms); carries intFltCompra', async () => {
            const legacy = buildLegacy();
            // 2026-04-15 00:00 UTC epoch ms.
            const epoch = Date.UTC(2026, 3, 15);
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [
                    {
                        indCod: 32,
                        indEspIdent: '220',
                        intDtaData: epoch,
                        intFltVenda: 5.1234,
                        intFltCompra: 5.0,
                        intVldStatus: '1',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            const cots = await client.listCotacoes({ indCod: '32', filCod: 2 });

            expect(cots).toHaveLength(1);
            expect(cots[0].indCod).toBe('32');
            expect(cots[0].intFltVenda).toBe(5.1234);
            expect(cots[0].intFltCompra).toBe(5.0);
            expect(cots[0].intVldStatus).toBe('1');
            expect(cots[0].intDtaData).toBeInstanceOf(Date);
            // BR-noon shift preserves the calendar day across UTC±12h.
            expect(cots[0].intDtaData.getUTCFullYear()).toBe(2026);
            expect(cots[0].intDtaData.getUTCMonth()).toBe(3);
            expect(cots[0].intDtaData.getUTCDate()).toBe(15);
        });

        it('rejects a malformed row (missing/NaN intFltVenda) with ConexosError', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [
                    {
                        indCod: 32,
                        indEspIdent: '220',
                        intDtaData: Date.UTC(2026, 3, 15),
                        // intFltVenda missing → must reject (never silently 0).
                        intVldStatus: '1',
                    },
                ],
            });
            const client = new ConexosClient(legacy);

            await expect(client.listCotacoes({ indCod: '32', filCod: 2 })).rejects.toBeInstanceOf(
                ConexosError,
            );
        });

        it('propagates ConexosError on transport failure', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('504 upstream'));
            const client = new ConexosClient(legacy);

            await expect(client.listCotacoes({ indCod: '32', filCod: 2 })).rejects.toBeInstanceOf(
                ConexosError,
            );
        });
    });

    // ─── Taxa DI/DUIMP (feature `taxa-di-duimp`, ADR-0022) ────────────────
    // Two read-only two-hop lookups by `priCod`, precedence DUIMP → DI:
    //   DUIMP: POST imp223/list → GET imp223/{dimCod}/{dioCod} (dioFltTaxaFrete)
    //   DI:    POST imp019/list → POST imp019/impDiPlanilha/list (rows[0].plcFltTaxaFat)
    describe('listDuimpByProcess (POST imp223/list)', () => {
        it('sends canonical filter body and maps rows to {dimCod, dioCod}', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ dimCod: 4321, dioCod: 7, extra: 'ignored' }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listDuimpByProcess({ priCod: '2566', filCod: 2 });

            expect(out).toEqual([{ dimCod: 4321, dioCod: 7 }]);
            const [path, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('imp223/list');
            const b = body as Record<string, unknown>;
            expect(b.serviceName).toBe('imp223');
            expect(b.filterList).toMatchObject({
                'priCod#EQ': '2566',
                'dioVldStatus#IN': ['0', '1'],
                'vldValidaProc#EQ': '1',
            });
            expect(opts).toEqual({ filCod: 2 });
        });

        it('returns [] on empty rows', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await expect(client.listDuimpByProcess({ priCod: '999', filCod: 2 })).resolves.toEqual(
                [],
            );
        });

        it('wraps transport failure in ConexosError carrying the endpoint', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('500 boom'));
            const client = new ConexosClient(legacy);

            await expect(
                client.listDuimpByProcess({ priCod: '2566', filCod: 2 }),
            ).rejects.toBeInstanceOf(ConexosError);
        });
    });

    describe('getDuimpTaxa (GET imp223/{dimCod}/{dioCod})', () => {
        it('calls the detail GET path with filCod and returns dioFltTaxaFrete', async () => {
            const legacy = buildLegacy();
            legacy.getGeneric.mockResolvedValue({ dioFltTaxaFrete: 5.1234 });
            const client = new ConexosClient(legacy);

            const taxa = await client.getDuimpTaxa({ dimCod: 4321, dioCod: 7, filCod: 2 });

            expect(taxa).toBe(5.1234);
            const [path, opts] = legacy.getGeneric.mock.calls[0];
            expect(path).toBe('imp223/4321/7');
            expect(opts).toEqual({ filCod: 2 });
        });

        it('wraps transport failure in ConexosError', async () => {
            const legacy = buildLegacy();
            legacy.getGeneric.mockRejectedValue(new Error('503'));
            const client = new ConexosClient(legacy);

            await expect(
                client.getDuimpTaxa({ dimCod: 1, dioCod: 1, filCod: 2 }),
            ).rejects.toBeInstanceOf(ConexosError);
        });

        it('rejects a malformed detail payload (missing dioFltTaxaFrete) as ConexosError', async () => {
            const legacy = buildLegacy();
            legacy.getGeneric.mockResolvedValue({ somethingElse: 1 });
            const client = new ConexosClient(legacy);

            await expect(
                client.getDuimpTaxa({ dimCod: 1, dioCod: 1, filCod: 2 }),
            ).rejects.toBeInstanceOf(ConexosError);
        });
    });

    describe('listDiByProcess (POST imp019/list)', () => {
        it('sends canonical filter body and maps rows to {cdiCod, cdiCodSeq}', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [{ cdiCod: 88, cdiCodSeq: 1, extra: 'x' }],
            });
            const client = new ConexosClient(legacy);

            const out = await client.listDiByProcess({ priCod: '2566', filCod: 2 });

            expect(out).toEqual([{ cdiCod: 88, cdiCodSeq: 1 }]);
            const [path, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('imp019/list');
            const b = body as Record<string, unknown>;
            expect(b.serviceName).toBe('imp019');
            expect(b.filterList).toMatchObject({
                'priCod#EQ': '2566',
                'cdiVldValidproc#EQ': '1',
            });
            expect(opts).toEqual({ filCod: 2 });
        });

        it('returns [] on empty rows', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await expect(client.listDiByProcess({ priCod: '999', filCod: 2 })).resolves.toEqual([]);
        });

        it('wraps transport failure in ConexosError', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('500'));
            const client = new ConexosClient(legacy);

            await expect(
                client.listDiByProcess({ priCod: '2566', filCod: 2 }),
            ).rejects.toBeInstanceOf(ConexosError);
        });
    });

    describe('getDiPlanilhaTaxa (POST imp019/impDiPlanilha/list)', () => {
        it('sends cdiCod + cdiCodSeq filter and returns rows[0].plcFltTaxaFat', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({
                count: 2,
                rows: [{ plcFltTaxaFat: 5.0987 }, { plcFltTaxaFat: 5.0987 }],
            });
            const client = new ConexosClient(legacy);

            const taxa = await client.getDiPlanilhaTaxa({ cdiCod: 88, cdiCodSeq: 1, filCod: 2 });

            expect(taxa).toBe(5.0987);
            const [path, body, opts] = legacy.listGenericPaginated.mock.calls[0];
            expect(path).toBe('imp019/impDiPlanilha/list');
            const b = body as Record<string, unknown>;
            expect(b.serviceName).toBe('imp019');
            expect(b.filterList).toMatchObject({ cdiCod: 88, cdiCodSeq: 1 });
            expect(opts).toEqual({ filCod: 2 });
        });

        it('returns null on empty rows', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
            const client = new ConexosClient(legacy);

            await expect(
                client.getDiPlanilhaTaxa({ cdiCod: 88, cdiCodSeq: 1, filCod: 2 }),
            ).resolves.toBeNull();
        });

        it('wraps transport failure in ConexosError', async () => {
            const legacy = buildLegacy();
            legacy.listGenericPaginated.mockRejectedValue(new Error('500'));
            const client = new ConexosClient(legacy);

            await expect(
                client.getDiPlanilhaTaxa({ cdiCod: 88, cdiCodSeq: 1, filCod: 2 }),
            ).rejects.toBeInstanceOf(ConexosError);
        });
    });
});
