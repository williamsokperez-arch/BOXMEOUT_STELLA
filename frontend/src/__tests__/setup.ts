/**
 * Jest setup file for all tests.
 * Configures MSW (Mock Service Worker) server lifecycle.
 */

import { server } from './mocks/handlers';

// Enable API mocking before all tests
beforeAll(() => {
  server.listen({
    onUnhandledRequest: 'error',
  });
});

// Reset any runtime handlers we may add during the tests
afterEach(() => {
  server.resetHandlers();
});

// Disable API mocking after the tests are done
afterAll(() => {
  server.close();
});

// Extend test timeout for async operations
jest.setTimeout(10000);
