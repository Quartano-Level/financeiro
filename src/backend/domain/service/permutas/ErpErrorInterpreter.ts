import { injectable, singleton } from 'tsyringe';

/** Uma mensagem do envelope `{ messages: [...] }` das validações do `fin010`. */
export interface ErpMessage {
    valid?: string;
    message?: string;
    vars?: Record<string, unknown>;
}

/** Leitura normalizada de um erro do ERP (Conexos `fin010`/`fin014`). */
export interface ErpErrorInterpretation {
    status?: number;
    data?: unknown;
    /** A KEY do erro (ex.: `Generic.ERROR_MESSAGE`, `FIN_010.*`). */
    key?: string;
    /** A RAZÃO REAL crua do ERP (`vars.msg`), quando presente. */
    reason?: string;
    /** Mensagem a exibir: razão real > tradução PT > key > `Error.message`. */
    friendly: string;
}

/**
 * ErpErrorInterpreter — fonte ÚNICA de tradução dos erros do `fin010` (unifica os mapas PT antes
 * divergentes de `routes/permutas.ts` e `ReconciliacaoPermutaService`). Extrai a razão REAL do ERP,
 * que vem escondida em `messages[0].vars.msg` quando a key é o envelope genérico `Generic.ERROR_MESSAGE`
 * (ex.: "CONTA DE DESCONTO NÃO INFORMADA!!!") — antes descartada, deixando o usuário com um texto genérico.
 *
 * `interpret` é para um erro CAPTURADO (lê `err.response.data` ou `err.cause.response.data`);
 * `describeMessage` é para uma mensagem de envelope já em mãos (guarda `valid==='ERRO'` do handshake).
 */
@singleton()
@injectable()
export default class ErpErrorInterpreter {
    /** Traduções PT por key — superset dos dois mapas anteriores. */
    private readonly ptByKey: Record<string, string> = {
        'FIN_014.DELETAR_REGISTRO_ESTORNO':
            'Não é possível excluir: este borderô tem um estorno vinculado no ERP.',
        'FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO':
            'Não é possível alterar: borderô finalizado. Estorne antes de mexer.',
        'FIN_010.FIN_IMPOSSIVEL_ALTERAR_REGISTRO': 'Borderô finalizado — não é possível alterar.',
        'FIN_010.DATA_BLOQUEADA_PELA_CONTABILIDADE':
            'Data do borderô bloqueada pela contabilidade (período fechado). Use uma data em período aberto.',
        CnxValidatorMny: 'Valor monetário inválido (precisão > 2 casas).',
        CnxValidatorDescr: 'Descrição/comentário inválido (precisa estar em MAIÚSCULAS).',
        // Fallback só para o Generic SEM `vars.msg` — a razão real (quando existe) vence antes disto.
        'Generic.ERROR_MESSAGE':
            'O ERP recusou esta operação para o borderô (estado incompatível com a ação).',
    };

    public interpret = (err: unknown): ErpErrorInterpretation => {
        const resp = this.extractResponse(err);
        const data = resp?.data as { messages?: ErpMessage[] } | undefined;
        const picked = this.pickMessage(data?.messages);
        const key = picked?.message;
        const reason = this.extractReason(picked);
        const fallback = err instanceof Error ? err.message : 'erro ao executar a ação no Conexos';
        return {
            ...(resp?.status !== undefined ? { status: resp.status } : {}),
            ...(data !== undefined ? { data } : {}),
            ...(key !== undefined ? { key } : {}),
            ...(reason !== undefined ? { reason } : {}),
            friendly: this.friendlyFor(key, reason, fallback),
        };
    };

    public describeMessage = (msg: ErpMessage): string => {
        const reason = this.extractReason(msg);
        return this.friendlyFor(msg.message, reason, msg.message ?? 'sem detalhe');
    };

    /** Prioridade: razão real (Generic) → tradução PT → razão → key → fallback. */
    private friendlyFor = (key?: string, reason?: string, fallback = ''): string => {
        if (key === 'Generic.ERROR_MESSAGE' && reason !== undefined) return reason;
        const mapped = key !== undefined ? this.ptByKey[key] : undefined;
        if (mapped !== undefined) return mapped;
        return reason ?? key ?? fallback;
    };

    /** `vars.msg` só conta se for string não-vazia (o ERP às vezes manda outros tipos ou vazio). */
    private extractReason = (msg?: ErpMessage): string | undefined => {
        const raw = msg?.vars?.msg;
        if (typeof raw !== 'string') return undefined;
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    };

    /**
     * Prefere a 1ª mensagem `valid==='ERRO'`; senão a 1ª mensagem do envelope. Robusto a envelope
     * malformado (não-array / itens null): este é um error-handler — NUNCA pode lançar (senão vira 500
     * genérico sem requestId, justo no caso que o surfacing existe pra tratar).
     */
    private pickMessage = (messages?: ErpMessage[]): ErpMessage | undefined => {
        if (!Array.isArray(messages)) return undefined;
        return messages.find((m) => m?.valid === 'ERRO') ?? messages[0];
    };

    /** O erro do ERP pode vir direto (`err.response`) ou aninhado no `cause` (ConexosError). */
    private extractResponse = (err: unknown): { status?: number; data?: unknown } | undefined => {
        const e = err as {
            response?: { status?: number; data?: unknown };
            cause?: { response?: { status?: number; data?: unknown } };
        };
        return e?.response ?? e?.cause?.response;
    };
}
