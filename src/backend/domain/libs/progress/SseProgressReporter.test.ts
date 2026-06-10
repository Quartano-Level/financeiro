import 'reflect-metadata';
// Ontology refs:
//   - ontology/ui-flows/frontend-observability.md
//   - ontology/integrations/api-error-contract.md
import { SseProgressReporter, type SseSink } from './SseProgressReporter.js';

const makeSink = (): SseSink & { chunks: string[]; ended: boolean } => {
    const chunks: string[] = [];
    let ended = false;
    return {
        chunks,
        get ended() {
            return ended;
        },
        write: (chunk: string) => {
            chunks.push(chunk);
            return true;
        },
        end: () => {
            ended = true;
        },
    };
};

describe('SseProgressReporter', () => {
    it('emits a progress frame per call', () => {
        const sink = makeSink();
        const reporter = new SseProgressReporter(sink);
        reporter.emit({ stage: 'fetch.processos', label: 'fetching', elapsedMs: 100 });
        reporter.emit({
            stage: 'compute.juros',
            label: 'computing',
            current: 1,
            total: 10,
            elapsedMs: 200,
        });

        expect(sink.chunks).toHaveLength(2);
        expect(sink.chunks[0]).toMatch(/^event: progress\ndata: /);
        expect(sink.chunks[0]).toContain('"stage":"fetch.processos"');
        expect(sink.chunks[1]).toContain('"current":1');
        // SSE frames end with \n\n
        expect(sink.chunks[0]).toMatch(/\n\n$/);
    });

    it('writeResult emits an event: result frame', () => {
        const sink = makeSink();
        const reporter = new SseProgressReporter(sink);
        reporter.writeResult({ ok: true, value: 42 });
        expect(sink.chunks).toHaveLength(1);
        expect(sink.chunks[0]).toMatch(/^event: result\n/);
        expect(sink.chunks[0]).toContain('"value":42');
    });

    it('writeError emits an event: error frame', () => {
        const sink = makeSink();
        const reporter = new SseProgressReporter(sink);
        reporter.writeError({ error: { code: 'BOOM' } });
        expect(sink.chunks[0]).toMatch(/^event: error\n/);
        expect(sink.chunks[0]).toContain('BOOM');
    });

    it('writeEnd flushes event: end and closes the sink', () => {
        const sink = makeSink();
        const reporter = new SseProgressReporter(sink);
        reporter.writeEnd();
        expect(sink.chunks[0]).toMatch(/^event: end\n/);
        expect(sink.ended).toBe(true);
    });

    it('ignores emits after writeEnd', () => {
        const sink = makeSink();
        const reporter = new SseProgressReporter(sink);
        reporter.writeEnd();
        reporter.emit({ stage: 'fetch', label: 'x', elapsedMs: 0 });
        reporter.writeResult({ x: 1 });
        expect(sink.chunks).toHaveLength(1); // only the end frame
    });
});
