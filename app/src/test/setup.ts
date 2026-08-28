import '@testing-library/jest-dom/vitest';

// Offline rule (from f1-telemetry-replay): tests never touch the network. An unmocked
// fetch fails loudly and names itself. Tests that mean to exercise fetch stub it.
beforeEach(() => {
  vi.stubGlobal('fetch', (input: unknown) => {
    throw new Error(`network access in tests is forbidden: fetch(${String(input)})`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
