import 'reflect-metadata';
import type ConexosBaseClient from './ConexosBaseClient.js';
import ConexosSispagClient from './ConexosSispagClient.js';

const buildBase = () => ({ listGenericPaginated: jest.fn() });
const make = (base: ReturnType<typeof buildBase>) =>
    new ConexosSispagClient(base as unknown as ConexosBaseClient);

const fin064Row = (over: Record<string, unknown> = {}) => ({
    docCod: '100',
    titCod: '1',
    dpeNomPessoa: 'ACME LTDA',
    titMnyValor: 1234.5,
    moeEspSigla: 'BRL',
    titDtaVencimento: 1_760_000_000_000,
    vldLib: 1,
    vldPago: 0,
    bncDesNome: 'ITAÚ',
    titNumRemessa: null,
    ...over,
});

describe('ConexosSispagClient (read-only)', () => {
    it('listTitulosAPagar mapeia rows do fin064 (liberado/pago via flags)', async () => {
        const base = buildBase();
        base.listGenericPaginated.mockResolvedValue({ count: 1, rows: [fin064Row()] });
        const titulos = await make(base).listTitulosAPagar(2, {
            minVencimento: 1,
            maxVencimento: 2,
        });
        expect(titulos[0]).toMatchObject({
            docCod: '100',
            titCod: '1',
            filCod: 2,
            credor: 'ACME LTDA',
            valor: 1234.5,
            liberado: true,
            pago: false,
            banco: 'ITAÚ',
        });
        // filtro server-side aplicado (vldPago + janela de vencimento)
        const [, body] = base.listGenericPaginated.mock.calls[0];
        expect((body as { filterList: Record<string, unknown> }).filterList).toMatchObject({
            'vldPago#EQ': 0,
            'titDtaVencimento#GE': 1,
            'titDtaVencimento#LE': 2,
        });
    });

    it('listTitulosAPagar cai para busca sem filtro quando o Conexos recusa o filtro', async () => {
        const base = buildBase();
        base.listGenericPaginated.mockRejectedValueOnce(new Error('400')).mockResolvedValueOnce({
            count: 1,
            rows: [fin064Row({ dpeNomPessoa: null, dpeNomPessoaFor: 'FRETE X' })],
        });
        const titulos = await make(base).listTitulosAPagar(2, { minVencimento: 1 });
        expect(base.listGenericPaginated).toHaveBeenCalledTimes(2);
        expect(titulos[0].credor).toBe('FRETE X');
    });

    it('getTituloAPagar acha o título por docCod+titCod ou devolve null', async () => {
        const base = buildBase();
        base.listGenericPaginated.mockResolvedValue({
            count: 2,
            rows: [fin064Row({ titCod: '9' }), fin064Row({ titCod: '1' })],
        });
        const found = await make(base).getTituloAPagar(2, '100', '1');
        expect(found?.titCod).toBe('1');
        base.listGenericPaginated.mockResolvedValue({ count: 0, rows: [] });
        expect(await make(base).getTituloAPagar(2, '100', '1')).toBeNull();
    });

    it('listLotes mapeia fin015 (envio/retorno via flags)', async () => {
        const base = buildBase();
        base.listGenericPaginated.mockResolvedValue({
            count: 1,
            rows: [
                {
                    flpCod: 3,
                    bncDesNome: 'ITAÚ',
                    conta: '55795-4',
                    layoutConta: 'AG:641',
                    flpVldStatus: 1,
                    flpVldConfEnvio: 1,
                    flpVldRet: 0,
                    titulosCount: 2,
                    soma: 500,
                    itensRetorno: 16,
                    usnDesNomeFin: 'RENE',
                    flpDtaCredito: 123,
                },
            ],
        });
        const lotes = await make(base).listLotes(2);
        expect(lotes[0]).toMatchObject({
            filCod: 2,
            flpCod: 3,
            envioConfirmado: true,
            retornoProcessado: false,
            itensRetorno: 16,
            finalizadoPor: 'RENE',
        });
    });

    it('listBorderosAPagar mapeia fin010 (temRemessa/temBaixa via flags)', async () => {
        const base = buildBase();
        base.listGenericPaginated.mockResolvedValue({
            count: 1,
            rows: [
                {
                    borCod: 1850,
                    gerDes: 'BANCO ITAÚ',
                    vlrTotalLiquido: 6449.25,
                    borDtaMvto: 123,
                    borVldFinalizado: 3,
                    vldHasRemessaPgto: 0,
                    vldHasBaixa: 1,
                },
            ],
        });
        const borderos = await make(base).listBorderosAPagar(2);
        expect(borderos[0]).toMatchObject({
            borCod: 1850,
            filCod: 2,
            temRemessa: false,
            temBaixa: true,
        });
        // filtro borVldTipo=2 (a-pagar)
        const [, body] = base.listGenericPaginated.mock.calls[0];
        expect((body as { filterList: Record<string, unknown> }).filterList).toMatchObject({
            'borVldTipo#EQ': 2,
        });
    });

    it('isDocInternacional detecta exterior por ufEspSigla=EX (com298)', async () => {
        const base = buildBase();
        base.listGenericPaginated.mockResolvedValue({
            count: 1,
            rows: [{ docCod: '200', ufEspSigla: 'EX' }],
        });
        expect(await make(base).isDocInternacional(2, '200')).toBe(true);
        const [endpoint, body] = base.listGenericPaginated.mock.calls[0];
        expect(endpoint).toBe('com298/list');
        expect((body as { filterList: Record<string, unknown> }).filterList).toMatchObject({
            'docCod#EQ': '200',
        });
    });

    it('isDocInternacional retorna false para UF brasileira', async () => {
        const base = buildBase();
        base.listGenericPaginated.mockResolvedValue({
            count: 1,
            rows: [{ docCod: '200', ufEspSigla: 'SP' }],
        });
        expect(await make(base).isDocInternacional(2, '200')).toBe(false);
    });

    it('listExteriorDocCods devolve o conjunto de docCods EX', async () => {
        const base = buildBase();
        base.listGenericPaginated.mockResolvedValue({
            count: 2,
            rows: [{ docCod: 200 }, { docCod: '201' }],
        });
        const set = await make(base).listExteriorDocCods(2);
        expect(set.has('200')).toBe(true);
        expect(set.has('201')).toBe(true);
        const [, body] = base.listGenericPaginated.mock.calls[0];
        expect((body as { filterList: Record<string, unknown> }).filterList).toMatchObject({
            'ufEspSigla#LIKE': 'EX',
        });
    });
});
