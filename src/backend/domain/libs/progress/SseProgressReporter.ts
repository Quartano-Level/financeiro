import type { ProgressEvent } from '../../interface/progress/ProgressEvent.js';
import type { ProgressReporter } from '../../interface/progress/ProgressReporter.js';

/**
 * Minimal sink the `SseProgressReporter` writes to. Models the subset of
 * `express.Response` we depend on (`write`, `end`) so we can unit-test the
 * reporter without booting a real HTTP server.
 */
export interface SseSink {
    write(chunk: string): boolean;
    end(): void;
}

/**
 * Emits SSE frames on a hijacked response. Each `emit` writes one
 * `event: progress\ndata: {…}\n\n` frame; `done()` is a no-op on the sink
 * (the route handler emits `event: end` / `event: result` after the service
 * resolves).
 *
 * Ontology refs:
 *   - ontology/ui-flows/frontend-observability.md
 *   - ontology/integrations/api-error-contract.md
 */
export class SseProgressReporter implements ProgressReporter {
    private closed = false;

    constructor(private readonly sink: SseSink) {}

    public emit = (event: ProgressEvent): void => {
        if (this.closed) return;
        this.write('progress', event);
    };

    public done = (): void => {
        // Intentional no-op: the outer handler is responsible for the final
        // `event: result` and `event: end` frames so it can include the
        // service return value (which a generic reporter does not have).
    };

    public writeResult = <T>(payload: T): void => {
        if (this.closed) return;
        this.write('result', payload);
    };

    public writeError = (envelope: unknown): void => {
        if (this.closed) return;
        this.write('error', envelope);
    };

    public writeEnd = (): void => {
        if (this.closed) return;
        this.write('end', {});
        this.closed = true;
        this.sink.end();
    };

    private write = (event: string, data: unknown): void => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        this.sink.write(payload);
    };
}
