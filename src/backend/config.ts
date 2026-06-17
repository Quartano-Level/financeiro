/**
 * Backend bootstrap config. Per ADR-0009 (multi-filial — sem hardcode de
 * filCod no domínio), `filCod` does NOT have a literal default: the value
 * must come either from an explicit `CONEXOS_FIL_COD` env var (legacy
 * single-tenant deploys) or from the request payload (multi-filial flows).
 * When neither is present the legacy header layer raises
 * `MissingFilCodError` instead of silently falling back to `2`.
 */
const parsedFilCod = process.env.CONEXOS_FIL_COD ? Number(process.env.CONEXOS_FIL_COD) : Number.NaN;

export const config = {
    conexos: {
        /**
         * Código da filial (cnx-filcod). `NaN` when no env override is
         * configured — callers MUST pass `filCod` explicitly. Per ADR-0009
         * the literal `2` no longer appears in source.
         */
        filCod: parsedFilCod,
        /**
         * Código do usuário (cnx-usncod). DEPRECATED: kept only as a fallback
         * for legacy code paths; the canonical value is captured at runtime
         * from the `/login` response (PR #19).
         */
        usnCod: process.env.CONEXOS_USN_COD ?? '97',
    },
} as const;
