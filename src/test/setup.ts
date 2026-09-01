// Registers jest-dom's matchers (toBeInTheDocument, etc.) for every test file
// in this project — see vitest.config.ts's test.setupFiles.
import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement ResizeObserver (GameShell observes its board
// element on mount). This file runs for every test regardless of
// per-file environment, so guard on `window` existing — a no-op for the
// node-environment pure-logic tests.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
