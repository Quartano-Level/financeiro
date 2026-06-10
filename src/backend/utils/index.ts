export const DEBUG_VERBOSE =
    process.env.DEBUG_VERBOSE === '1' || process.env.DEBUG_VERBOSE === 'true';

/**
 * Parse a closing-report `dataBase` (e.g. `"2026-03-31"`) and pin it to the
 * inclusive end of day in BR time (23:59:59.999-03:00). All downstream cutoffs
 * (`doc.dataEmissao.getTime() <= dataBase.getTime()`) compare against
 * `Date` instances that were emitted by `ConexosClient.parseDate`, which shifts
 * Conexos midnight-UTC timestamps forward by 15h to anchor at 12:00 BRT.
 *
 * Without this normalisation, `new Date("2026-03-31")` lands on `00:00 UTC`,
 * which is BEFORE the 15h-shifted internal representation of any doc emitted
 * on 31/03 — same-day documents are silently dropped from the report.
 *
 * Accepts either `YYYY-MM-DD` or any ISO-8601 string. Only the date portion
 * is honoured; time/zone in the input are ignored to avoid double-counting
 * timezone normalisation (e.g. `"2026-03-31T22:00:00-03:00"` still pins to
 * 31/03 end-of-day BR, not 01/04).
 */
export const parseDataBaseInclusiveBR = (raw: string): Date => {
    const datePart = raw.slice(0, 10);
    return new Date(`${datePart}T23:59:59.999-03:00`);
};

/**
 * Formata um Date como `YYYY-MM-DD` no fuso BR (`America/Sao_Paulo`). Necessário
 * para serializar `dataBase` na resposta: o `Date` interno aponta para 23:59:59 BR
 * (= 02:59 UTC do dia seguinte), e `Date.toISOString().slice(0,10)` extrai o dia
 * UTC, exibindo o dia seguinte no front. Esta função fixa o dia BR e devolve a
 * string canônica que o usuário espera ver em qualquer formatter downstream.
 */
export const formatBrDate = (d: Date): string =>
    d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/**
 * Day-key (`YYYY-MM-DD`) do dia de calendário PRETENDIDO de um `Date` de
 * documento Conexos. Tanto datas numéricas (deslocadas +15h → 15:00Z) quanto
 * datas string (00:00Z) expõem o dia pretendido via `getUTC*()` — ambas
 * permanecem no MESMO dia UTC. Comparar este key contra o dia BR de `dataBase`
 * (via `formatBrDate`) é robusto às duas codificações.
 */
export const brDayKey = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/**
 * Cutoff de calendário BR-day: `true` quando o dia de calendário pretendido de
 * `date` é ≤ o dia BR de `dataBase`. Corrige o falso-positivo legado em que um
 * doc de 01/05 00:00Z passava no compare numérico `getTime()` contra um
 * `dataBase` pinado em 23:59:59.999-03:00 (= 02:59:59Z de 01/05).
 *
 * `date` (documento Conexos) tem seu dia pretendido exposto por `brDayKey`
 * (getUTC*); `dataBase` tem seu dia BR via `formatBrDate` (America/Sao_Paulo).
 * Comparação lexicográfica de `YYYY-MM-DD` é equivalente à cronológica.
 */
export const isOnOrBeforeBrDay = (date: Date, dataBase: Date): boolean =>
    brDayKey(date) <= formatBrDate(dataBase);

export function boxLog(title: string, data: any) {
    if (!DEBUG_VERBOSE) return;
    const line = '='.repeat(50);
    console.log(`\n${line}`);
    console.log(`[ ${title.toUpperCase()} ]`);
    console.log(line);
    console.log(JSON.stringify(data, null, 2));
    console.log(`${line}\n`);
}

export function logEvent(event: string, data: any) {
    console.log(`[${new Date().toISOString()}] ${event}:`, data);
}
