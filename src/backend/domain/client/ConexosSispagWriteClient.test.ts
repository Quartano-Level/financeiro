import 'reflect-metadata';
import ConexosError from '../errors/ConexosError.js';
import type { ContaPagadora } from '../interface/sispag/Fin015Write.js';
import type ConexosBaseClient from './ConexosBaseClient.js';
import ConexosSispagWriteClient from './ConexosSispagWriteClient.js';

const buildBase = () => ({
    ensureSid: jest.fn().mockResolvedValue(undefined),
    postGenericOnce: jest.fn(),
    getGeneric: jest.fn(),
    listGenericPaginated: jest.fn(),
    runWithRetry: jest.fn(<T>(fn: () => Promise<T>) => fn()),
});
const make = (base: ReturnType<typeof buildBase>) =>
    new ConexosSispagWriteClient(base as unknown as ConexosBaseClient);

const ITAU: ContaPagadora = {
    bncCod: 4,
    bncNumCodbanco: 341,
    ccoCod: 1,
    ccoNumConta: 55795,
    ccoEspDvconta: '4',
    ccoEspAgcod: '0641',
    conta: '55795-4',
    layoutConta: 'AG:0641/CT:55795-4',
};

/** Erro axios-shaped com corpo de validação do Conexos. */
const validationError = (body: unknown) => ({ response: { status: 400, data: body } });

describe('ConexosSispagWriteClient (fin015 write toolbox)', () => {
    describe('criarLote', () => {
        it('usa postGenericOnce (não-idempotente) e devolve o flpCod', async () => {
            const base = buildBase();
            base.postGenericOnce.mockResolvedValue({ flpCod: 18 });
            const res = await make(base).criarLote({ filCod: 1, conta: ITAU, dataDebito: 123 });
            expect(res).toEqual({ flpCod: 18, filCod: 1, bncCod: 4 });
            // NÃO usa o post com retry
            const [endpoint, body] = base.postGenericOnce.mock.calls[0];
            expect(endpoint).toBe('fin015');
            expect(body).toMatchObject({
                filCod: 1,
                bncCod: 4,
                conta: '55795-4',
                layoutConta: 'AG:0641/CT:55795-4',
                flpDtaCredito: 123,
                flpVldStatus: 0,
            });
        });

        it('desembrulha a resposta em .data quando o ERP embrulha', async () => {
            const base = buildBase();
            base.postGenericOnce.mockResolvedValue({ data: { flpCod: 42 } });
            expect(
                (await make(base).criarLote({ filCod: 1, conta: ITAU, dataDebito: 1 })).flpCod,
            ).toBe(42);
        });

        it('sem flpCod válido → ConexosError (não cria lote fantasma)', async () => {
            const base = buildBase();
            base.postGenericOnce.mockResolvedValue({ message: 'ok mas sem id' });
            await expect(
                make(base).criarLote({ filCod: 1, conta: ITAU, dataDebito: 1 }),
            ).rejects.toBeInstanceOf(ConexosError);
        });
    });

    describe('importarTitulos', () => {
        it('embrulha os itens em { items } e usa postGenericOnce', async () => {
            const base = buildBase();
            base.postGenericOnce.mockResolvedValue({ valid: 'SUCESSO' });
            const item = { docCod: 520, titCod: 1, filCodLote: 1, bncCod: 4, flpCod: 18 };
            await make(base).importarTitulos({ filCod: 1, bncCod: 4, flpCod: 18, itens: [item] });
            const [endpoint, body] = base.postGenericOnce.mock.calls[0];
            expect(endpoint).toBe('fin015/finItemSispag/titulosPendentes/importar');
            expect(body).toEqual({ items: [item] });
        });
    });

    describe('finalizarLote', () => {
        it('é um GET; sucesso não lança', async () => {
            const base = buildBase();
            base.getGeneric.mockResolvedValue({ valid: 'SUCESSO' });
            await expect(
                make(base).finalizarLote({ filCod: 1, bncCod: 4, flpCod: 18 }),
            ).resolves.toBeUndefined();
            expect(base.getGeneric.mock.calls[0][0]).toBe('fin015/finalizarLote/1/4/18');
        });

        it('R1/R2 (VALIDATION_LIST) → ConexosError com a msg do ERP no message', async () => {
            const base = buildBase();
            base.getGeneric.mockRejectedValue(
                validationError({
                    type: 'VALIDATION_LIST',
                    messages: [
                        { vars: { msg: 'A DATA DE DÉBITO NÃO PODE SER MENOR QUE A DATA DE HOJE' } },
                    ],
                }),
            );
            await expect(
                make(base).finalizarLote({ filCod: 1, bncCod: 4, flpCod: 18 }),
            ).rejects.toMatchObject({
                message: expect.stringContaining('DATA DE DÉBITO'),
            });
        });
    });

    describe('gerarRemessa', () => {
        it('usa postGenericOnce e marca sucesso em SUCESSO', async () => {
            const base = buildBase();
            base.postGenericOnce.mockResolvedValue({
                valid: 'SUCESSO',
                message: 'Generic.PROCEDIMENTO_SUCESSO',
            });
            const res = await make(base).gerarRemessa({
                filCod: 1,
                bncCod: 4,
                flpCod: 18,
                grbCodSeq: 1,
                seqNum: 77,
                gabEspNomeArquivo: 'PG090777.REM',
            });
            expect(res.sucesso).toBe(true);
            const [endpoint, body] = base.postGenericOnce.mock.calls[0];
            expect(endpoint).toBe('fin015/gerArquivosBancos/gerarRemessa');
            expect(body).toEqual({
                filCodLote: 1,
                bncCod: 4,
                flpCod: 18,
                grbCodSeq: 1,
                seqNum: 77,
                gabEspNomeArquivo: 'PG090777.REM',
            });
        });

        it('campo faltante (VALIDATION) → ConexosError listando o campo', async () => {
            const base = buildBase();
            base.postGenericOnce.mockRejectedValue(
                validationError({
                    type: 'VALIDATION',
                    itemMessages: [{ item: 'seqNum', messages: [{ constraint: 'required' }] }],
                }),
            );
            await expect(
                make(base).gerarRemessa({
                    filCod: 1,
                    bncCod: 4,
                    flpCod: 18,
                    grbCodSeq: 1,
                    seqNum: 0,
                    gabEspNomeArquivo: 'x.REM',
                }),
            ).rejects.toMatchObject({ message: expect.stringContaining('seqNum') });
        });
    });

    describe('leituras (via runWithRetry)', () => {
        it('listarTitulosPendentes mapeia as linhas e passa pelo runWithRetry', async () => {
            const base = buildBase();
            base.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [
                    {
                        filCod: 1,
                        docCod: 520,
                        titCod: 1,
                        itsVldModalidade: 7,
                        itsMnyValor: 1000,
                        itsEspNomeFav: 'DC LOGISTICS',
                    },
                ],
            });
            const pend = await make(base).listarTitulosPendentes({
                filCod: 1,
                bncCod: 4,
                flpCod: 18,
            });
            expect(base.runWithRetry).toHaveBeenCalledTimes(1);
            expect(pend[0]).toMatchObject({
                docCod: '520',
                titCod: '1',
                itsVldModalidade: 7,
                valor: 1000,
                favorecido: 'DC LOGISTICS',
            });
            expect(pend[0].raw).toBeDefined();
            expect(base.listGenericPaginated.mock.calls[0][0]).toBe(
                'fin015/finItemSispag/titulosPendentes/list/1/4/18',
            );
        });

        it('listarArquivosRemessa expõe o .REM em conteudo (gabLngDados)', async () => {
            const base = buildBase();
            base.listGenericPaginated.mockResolvedValue({
                count: 1,
                rows: [
                    {
                        gabCod: 17,
                        gabEspNomeArquivo: 'PG171101.REM',
                        gabLngDados: '34100000COLUMBIA...',
                    },
                ],
            });
            const arqs = await make(base).listarArquivosRemessa({
                filCod: 1,
                bncCod: 4,
                flpCod: 18,
            });
            expect(arqs[0]).toMatchObject({
                gabCod: 17,
                nomeArquivo: 'PG171101.REM',
                conteudo: '34100000COLUMBIA...',
            });
        });

        it('baixarRemessa devolve o conteúdo como string', async () => {
            const base = buildBase();
            base.getGeneric.mockResolvedValue('34100000...REM-CONTENT');
            expect(await make(base).baixarRemessa({ filCod: 1, gabCod: 17 })).toBe(
                '34100000...REM-CONTENT',
            );
        });
    });
});
