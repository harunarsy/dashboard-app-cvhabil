import "@testing-library/jest-dom/vitest";
import { TextDecoder, TextEncoder } from "util";
import { vi } from "vitest";

globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(String(key)) ? values.get(String(key)) : null),
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  };
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: createStorage(),
});
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  writable: true,
  value: createStorage(),
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
