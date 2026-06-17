import '@testing-library/jest-dom';

// Polyfills required by Radix UI primitives in jsdom (Switch, Select, etc).
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
    class ResizeObserverPolyfill {
        observe = (): void => undefined;
        unobserve = (): void => undefined;
        disconnect = (): void => undefined;
    }
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverPolyfill;
}

// Polyfill PointerEvent helpers used by Radix in jsdom.
if (typeof window !== 'undefined') {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    if (!('hasPointerCapture' in proto)) {
        proto.hasPointerCapture = (): boolean => false;
    }
    if (!('releasePointerCapture' in proto)) {
        proto.releasePointerCapture = (): void => undefined;
    }
    if (!('scrollIntoView' in proto)) {
        proto.scrollIntoView = (): void => undefined;
    }
}
