import type { Filial, LegacyConexosShape, PagedResponse } from './ConexosClient.js';

/**
 * Adapter delegando 100% para o `services/conexos.ts` singleton (ADR-0007).
 *
 * Antes: tínhamos um `ownClient` axios separado com `ownLogin` próprio →
 * 2 sessões Conexos paralelas por user (gambiarra G4). Resolvido em
 * 2026-05-06 expondo `getSid`+`authenticatedPost` na ConexosService legacy.
 * O adapter agora é um pass-through fino — não mantém estado.
 *
 * Trade-off: acopla closing-reports ao axios legacy, ganhando 401-retry
 * com mutex+sessionToKill de graça. v0.2 (ADR-0006) ainda planeja
 * substituir o legacy por um ConexosClient nativo que owne a auth, mas
 * sem precisar de duas sessões nesse meio tempo.
 */
export const buildLegacyConexosAdapter = async (_config: {
    conexosBaseUrl: string;
    conexosUsername: string;
    conexosPassword: string;
    filCod: number;
}): Promise<LegacyConexosShape> => {
    const { conexosService } = (await import('../../services/conexos.js')) as {
        conexosService: {
            ensureSid: () => Promise<void>;
            getFiliais: () => Promise<Filial[]>;
            getFilCodDefault: () => Promise<number | null>;
            getSid: () => Promise<{ sid: string; usnCod: string }>;
            authenticatedPost: <T = unknown>(
                path: string,
                body: unknown,
                opts?: { filCod?: number },
            ) => Promise<T>;
            authenticatedGet: <T = unknown>(path: string, opts?: { filCod?: number }) => Promise<T>;
            authenticatedDelete: <T = unknown>(
                path: string,
                opts?: { filCod?: number },
            ) => Promise<T>;
        };
    };

    const listGeneric = async <T>(
        serviceName: string,
        body: Record<string, unknown>,
        opts?: { filCod?: number },
    ): Promise<T> => {
        const data = await conexosService.authenticatedPost<{ rows?: T } | T>(
            `/${serviceName}`,
            body,
            opts,
        );
        const maybeRows = (data as { rows?: T }).rows;
        return (maybeRows ?? data) as T;
    };

    /**
     * Paginated variant of `listGeneric` that preserves the `{count, rows}`
     * envelope returned by Conexos list endpoints. Used by `ConexosClient`'s
     * `paginate` helper to drive multi-page loops.
     *
     * Endpoints that don't return an envelope (e.g. baixas/list) won't be
     * called here — `paginate` is reserved for the canonical
     * `imp021/list`-style endpoints.
     */
    const listGenericPaginated = async <Row>(
        serviceName: string,
        body: Record<string, unknown>,
        opts?: { filCod?: number },
    ): Promise<PagedResponse<Row>> => {
        const data = await conexosService.authenticatedPost<{ count?: number; rows?: Row[] }>(
            `/${serviceName}`,
            body,
            opts,
        );
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const count = typeof data?.count === 'number' ? data.count : rows.length;
        return { count, rows };
    };

    /**
     * GET-style passthrough. Used for endpoints that expose data through GET
     * paths (e.g. `com311/list/<docCod>`, `com311/baixas/list/...`). Returns
     * the raw response shape (`{ count, rows }` for com311 list endpoints,
     * `{ rows }` for the baixas endpoint).
     */
    const getGeneric = async <T>(path: string, opts?: { filCod?: number }): Promise<T> => {
        return conexosService.authenticatedGet<T>(`/${path}`, opts);
    };

    /**
     * Raw POST passthrough for WRITE endpoints (Fase 3 — `fin010` baixa/permuta).
     * Returns the response body as-is (no `.rows` unwrapping) — write endpoints
     * answer a plain object (`{ borCod }`, `{ bxaCodSeq }`, `{ messages, responseData }`).
     */
    const postGeneric = async <T>(
        path: string,
        body: Record<string, unknown>,
        opts?: { filCod?: number },
    ): Promise<T> => {
        return conexosService.authenticatedPost<T>(`/${path}`, body, opts);
    };

    /** DELETE passthrough — exclusão de baixa do borderô (`fin010/baixas/...`). */
    const deleteGeneric = async <T>(path: string, opts?: { filCod?: number }): Promise<T> => {
        return conexosService.authenticatedDelete<T>(`/${path}`, opts);
    };

    return {
        ensureSid: () => conexosService.ensureSid(),
        listGeneric,
        listGenericPaginated,
        getGeneric,
        postGeneric,
        deleteGeneric,
        getFiliais: () => conexosService.getFiliais(),
        getFilCodDefault: () => conexosService.getFilCodDefault(),
    };
};

class LegacyConexosAdapterToken {}
export const LegacyConexosAdapter = LegacyConexosAdapterToken;
