import { inject, injectable, singleton } from 'tsyringe';
import IngestaoPermutasService, {
    type IngestaoParams,
    type IngestaoResult,
} from './IngestaoPermutasService.js';

type Waiter = {
    resolve: (result: IngestaoResult) => void;
    reject: (err: unknown) => void;
};

/**
 * IngestaoCoalescerService — coalescing IN-PROCESS da ingestão (card cc-auto-ingest-coalesce).
 *
 * A re-ingestão disparada pela UI (cliente-filtro add/remove) é PESADA. Cliques
 * em sequência disparavam várias ingestões concorrentes — origem do HTTP 429 e de
 * fan-out Conexos redundante. Este serviço serializa as chamadas da MESMA instância:
 *
 * - 1ª chamada → roda a ingestão.
 * - chamadas que chegam DURANTE uma rodada → NÃO disparam outra; ficam em espera e
 *   são satisfeitas por UMA rodada-trailing após a atual (garante que a mudança de
 *   quem entrou no meio seja ingerida — correção: o rerun começa DEPOIS do request).
 * - mantém-se SÍNCRONO (o caller aguarda o resultado) → preserva a UX do remover
 *   (spinner até concluir + compensação em falha).
 *
 * É `@singleton` para o estado in-flight ser compartilhado entre requests. A
 * exclusão CROSS-instância continua sendo o advisory lock do `IngestaoPermutasService`
 * (que lança `IngestLockBusyError` → 409, tratado no front). No alvo Lambda isto
 * vira dedup via SQS/EventBridge; aqui é o pragmático para o Express/Render.
 */
@singleton()
@injectable()
export default class IngestaoCoalescerService {
    private inFlight = false;
    private waiters: Waiter[] = [];

    constructor(
        @inject(IngestaoPermutasService)
        private ingestaoService: IngestaoPermutasService,
    ) {}

    /** Dispara (ou junta-se a) uma ingestão. O 1º caller resolve assim que SUA
     * rodada conclui; quem entra no meio é satisfeito por uma rodada-trailing (que
     * inclui a mudança dele). Erros propagam (ex.: `IngestLockBusyError` → 409). */
    public request = async (params: IngestaoParams): Promise<IngestaoResult> => {
        if (this.inFlight) {
            return new Promise<IngestaoResult>((resolve, reject) => {
                this.waiters.push({ resolve, reject });
            });
        }
        this.inFlight = true;
        try {
            return await this.ingestaoService.executar(params);
        } finally {
            // Trailing roda DESTACADO: o 1º caller não espera os reruns dos outros.
            // Mantém `inFlight` true até drenar todos os waiters.
            this.drainTrailing(params);
        }
    };

    /**
     * Drena os waiters acumulados: cada lote ganha UMA nova execução (que inclui as
     * mudanças deles). Roda destacado (não bloqueia o 1º caller). Single-threaded:
     * só há await dentro do `executar`, então waiters que chegam durante uma rodada
     * são pegos na próxima iteração; quando não há mais waiters, libera `inFlight`.
     */
    private drainTrailing = (params: IngestaoParams): void => {
        void (async () => {
            while (this.waiters.length > 0) {
                const batch = this.waiters;
                this.waiters = [];
                try {
                    const result = await this.ingestaoService.executar(params);
                    for (const w of batch) w.resolve(result);
                } catch (err) {
                    for (const w of batch) w.reject(err);
                }
            }
            this.inFlight = false;
        })();
    };
}
