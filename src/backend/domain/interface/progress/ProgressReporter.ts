import type { ProgressEvent } from './ProgressEvent.js';

/**
 * Output port for progress emissions. Implemented by:
 *   - `NULL_PROGRESS`              — no-op default for non-streaming callers
 *   - `SseProgressReporter` (T6)   — flushes `event: progress` SSE frames
 *   - test doubles
 *
 * Ontology refs:
 *   - ontology/ui-flows/frontend-observability.md
 */
export interface ProgressReporter {
    emit(event: ProgressEvent): void;
    done(): void;
}

/**
 * No-op reporter used when the caller did not negotiate streaming. Lets the
 * services unconditionally call `reporter.emit(...)` without branching on a
 * nullable reporter.
 */
export const NULL_PROGRESS: ProgressReporter = {
    emit: (): void => {
        // intentionally empty
    },
    done: (): void => {
        // intentionally empty
    },
};
