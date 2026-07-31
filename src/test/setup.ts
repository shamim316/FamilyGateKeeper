import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Harmless in the node suites, which never mount anything.
afterEach(() => {
  cleanup();
});
