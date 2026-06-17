/**
 * Resultado settled de um item processado por `BoundedConcurrency.run`.
 * Espelha o shape de `PromiseSettledResult` mas é tipado explicitamente
 * para que o caller possa mapear uma rejeição de volta ao seu item de
 * origem (e.g. a filial que falhou num fan-out multi-filial).
 */
export type BoundedConcurrencyResult<T> =
    | { status: 'fulfilled'; value: T }
    | { status: 'rejected'; reason: unknown };

/**
 * Promise-pool de concorrência limitada. Processa um array de itens com um
 * worker fn, nunca executando mais de `limit` workers ao mesmo tempo. Não
 * lança na primeira rejeição: cada item produz uma entrada settled
 * (`fulfilled`/`rejected`) preservando o índice de entrada — o que defeitos
 * de um item não derrubem o lote (tolerância a falha).
 *
 * Substitui o burst `Promise.all` de N filiais de uma vez (que ele próprio
 * contribui para as falhas Conexos 504/LOGIN_ERROR_MAX_SESSIONS). Sem
 * `setTimeout` loops — pool puro de promessas.
 */
export default class BoundedConcurrency {
    /**
     * @param items   itens a processar.
     * @param worker  fn aplicada a cada item (recebe item + índice).
     * @param limit   máximo de workers concorrentes (default 3).
     * @returns       lista settled, uma entrada por item, na ordem de entrada.
     */
    public run = async <TIn, TOut>(
        items: ReadonlyArray<TIn>,
        worker: (item: TIn, index: number) => Promise<TOut>,
        limit = 3,
    ): Promise<Array<BoundedConcurrencyResult<TOut>>> => {
        const results: Array<BoundedConcurrencyResult<TOut>> = new Array(items.length);
        const effectiveLimit = Math.max(1, Math.min(limit, items.length || 1));
        let nextIndex = 0;

        const runWorker = async (): Promise<void> => {
            while (nextIndex < items.length) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                try {
                    const value = await worker(items[currentIndex], currentIndex);
                    results[currentIndex] = { status: 'fulfilled', value };
                } catch (reason) {
                    results[currentIndex] = { status: 'rejected', reason };
                }
            }
        };

        const pool: Array<Promise<void>> = [];
        for (let i = 0; i < effectiveLimit; i += 1) {
            pool.push(runWorker());
        }
        await Promise.all(pool);

        return results;
    };

    /**
     * Bounded drop-in replacement for `Promise.all(items.map(worker))` —
     * semântica **propagate**: rejeita com o `reason` da PRIMEIRA falha (em
     * ordem de índice) em vez de settled. Output é a lista de valores na
     * ordem de entrada (`out[i]` ← `items[i]`), independente da ordem de
     * conclusão. Usar quando o caller já tem um boundary de erro próprio
     * (e.g. um best-effort por item) e só precisa do bound de paralelismo
     * contra Conexos (LOGIN_ERROR_MAX_SESSIONS).
     *
     * Implementado por cima de `run` (mesmo pool, mesmo bound): todos os
     * workers settle antes da rejeição surgir — difere de um fail-fast
     * temporal apenas em latência de falha, nunca em resultado.
     *
     * @param items   itens a processar.
     * @param worker  fn aplicada a cada item (recebe item + índice).
     * @param limit   máximo de workers concorrentes (default 3).
     * @returns       valores na ordem de entrada; rejeita na 1ª falha.
     */
    public map = async <TIn, TOut>(
        items: ReadonlyArray<TIn>,
        worker: (item: TIn, index: number) => Promise<TOut>,
        limit = 3,
    ): Promise<TOut[]> => {
        const settled = await this.run(items, worker, limit);
        const out: TOut[] = new Array(settled.length);
        for (let i = 0; i < settled.length; i += 1) {
            const result = settled[i];
            if (result.status === 'rejected') {
                throw result.reason;
            }
            out[i] = result.value;
        }
        return out;
    };
}
