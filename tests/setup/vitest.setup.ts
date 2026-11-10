import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// `globals` is off, so React Testing Library's automatic cleanup is not registered for us.
afterEach(() => {
  cleanup();
});

// jsdom lacks several browser APIs that Radix UI / cmdk rely on. Minimal stand-ins only.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {
      /* jsdom stub */
    }
    unobserve(): void {
      /* jsdom stub */
    }
    disconnect(): void {
      /* jsdom stub */
    }
  };
}

Element.prototype.scrollIntoView = function scrollIntoView(): void {
  /* jsdom stub */
};
Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
  return false;
};
Element.prototype.setPointerCapture = function setPointerCapture(): void {
  /* jsdom stub */
};
Element.prototype.releasePointerCapture = function releasePointerCapture(): void {
  /* jsdom stub */
};
