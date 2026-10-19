// Global test configuration applied to all test suites via setupFilesAfterEnv.
// Individual test files manage their own database lifecycle to avoid conflicts
// with transaction-based service implementations.

// Extend Jest timeout for slow integration tests (overrides config default)
jest.setTimeout(30000);
