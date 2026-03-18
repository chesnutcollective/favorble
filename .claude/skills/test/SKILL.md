---
name: test
description: Run Vitest tests for this project. Use when running tests, debugging test failures, checking coverage, or before commits.
allowed-tools: Bash(pnpm:*), Read, Grep
---

# Vitest Testing

## Commands

Run all tests:
```bash
pnpm test
```

Run with coverage:
```bash
pnpm test:coverage
```

Watch mode:
```bash
pnpm test:watch
```

Run specific test file:
```bash
pnpm test -- --run path/to/test.test.ts
```

## Instructions

1. Clarify which tests to run (all, specific, pattern)
2. Run the appropriate command
3. Show results and any failure details
4. For failures, explain the first failing assertion and offer to help debug

## Test Structure

- `__tests__/` - Main test directory
- `__tests__/utils/` - Test utilities (mocks.ts, render.tsx)
- `__tests__/factories/` - Data factories
- `vitest.config.mts` - Vitest configuration
- `vitest.setup.ts` - Test setup file
