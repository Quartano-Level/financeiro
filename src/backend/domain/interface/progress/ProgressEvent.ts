/**
 * Granular progress signal emitted by long-running services so the UI can
 * render a real progress bar instead of a deterministic fake one.
 *
 * Ontology refs:
 *   - ontology/ui-flows/frontend-observability.md (rule 1)
 *
 * `stage` is the closed-set identifier (e.g. `fetch.imp059`, `compute.juros`).
 * Frontend code branches on it only for analytics; UX renders `label`.
 *
 * `current` / `total` are optional. When present, the UI may render a precise
 * percentage. When absent, the UI shows an indeterminate stage hint.
 */
export interface ProgressEvent {
    stage: string;
    label: string;
    current?: number;
    total?: number;
    elapsedMs: number;
}
