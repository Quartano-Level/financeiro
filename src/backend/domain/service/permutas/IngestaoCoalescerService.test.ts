import 'reflect-metadata';
import type IngestaoPermutasService from './IngestaoPermutasService.js';
import type { IngestaoResult } from './IngestaoPermutasService.js';
import IngestaoCoalescerService from './IngestaoCoalescerService.js';

const result = (n: number): IngestaoResult => ({
    runId: `run-${n}`,
    flowId: `flow-${n}`,
    status: 'success',
    totalAdiantamentos: n,
    totalInvoices: 0,
    totalCasamentos: 0,
    totalStale: 0,
});

/** Promessa que resolvemos manualmente, p/ controlar o timing do executar. */
const deferred = <T>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const flush = () => new Promise((r) => setImmediate(r));

describe('IngestaoCoalescerService', () => {
    it('chamada única → executa uma vez e devolve o resultado', async () => {
        const executar = jest.fn().mockResolvedValue(result(1));
        const service = new IngestaoCoalescerService({
            executar,
        } as unknown as IngestaoPermutasService);
        await expect(service.request({ triggeredBy: 'u' })).resolves.toMatchObject({
            runId: 'run-1',
        });
        expect(executar).toHaveBeenCalledTimes(1);
    });

    it('coalescing: N chamadas durante 1 rodada → 1 execução + 1 rerun-trailing (não N)', async () => {
        const d1 = deferred<IngestaoResult>();
        const d2 = deferred<IngestaoResult>();
        const executar = jest
            .fn()
            .mockImplementationOnce(() => d1.promise)
            .mockImplementationOnce(() => d2.promise);
        const service = new IngestaoCoalescerService({
            executar,
        } as unknown as IngestaoPermutasService);

        const a = service.request({ triggeredBy: 'A' }); // inicia a rodada (executar #1)
        await flush();
        const b = service.request({ triggeredBy: 'B' }); // entra no meio → waiter
        const c = service.request({ triggeredBy: 'C' }); // entra no meio → waiter
        await flush();
        expect(executar).toHaveBeenCalledTimes(1); // só a 1ª rodada começou

        d1.resolve(result(1)); // 1ª rodada conclui → A resolve; dispara 1 rerun p/ B+C
        await expect(a).resolves.toMatchObject({ runId: 'run-1' });
        await flush();
        expect(executar).toHaveBeenCalledTimes(2); // UMA rodada-trailing p/ os 2 waiters

        d2.resolve(result(2));
        await expect(b).resolves.toMatchObject({ runId: 'run-2' });
        await expect(c).resolves.toMatchObject({ runId: 'run-2' });
        expect(executar).toHaveBeenCalledTimes(2); // não houve 3ª execução
    });

    it('erro na 1ª rodada → rejeita o caller; rerun atende os waiters', async () => {
        const d1 = deferred<IngestaoResult>();
        const executar = jest
            .fn()
            .mockImplementationOnce(() => d1.promise)
            .mockResolvedValueOnce(result(9));
        const service = new IngestaoCoalescerService({
            executar,
        } as unknown as IngestaoPermutasService);

        const a = service.request({ triggeredBy: 'A' });
        await flush();
        const b = service.request({ triggeredBy: 'B' }); // waiter
        await flush();

        d1.reject(new Error('conexos down')); // 1ª rodada falha
        await expect(a).rejects.toThrow('conexos down');
        await expect(b).resolves.toMatchObject({ runId: 'run-9' }); // rerun salva o waiter
    });

    it('após concluir, uma nova chamada dispara nova rodada (estado in-flight resetado)', async () => {
        const executar = jest
            .fn()
            .mockResolvedValueOnce(result(1))
            .mockResolvedValueOnce(result(2));
        const service = new IngestaoCoalescerService({
            executar,
        } as unknown as IngestaoPermutasService);
        await service.request({ triggeredBy: 'u' });
        await service.request({ triggeredBy: 'u' });
        expect(executar).toHaveBeenCalledTimes(2);
    });
});
