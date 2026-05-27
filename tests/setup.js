// Extends Vitest's expect with @testing-library/jest-dom matchers
// (toBeInTheDocument, etc.) for component tests. Harmless for node-env tests.
import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs it.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
