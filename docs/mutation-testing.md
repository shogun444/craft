# Mutation Testing Guide

## Overview

Mutation testing is a technique to verify the quality and effectiveness of test suites by introducing deliberate bugs (mutations) into the code and checking if tests catch them. This document describes the mutation testing setup for CRAFT's critical services.

## Setup

### Installation

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker
```

### Configuration

The mutation testing configuration is defined in `stryker.conf.json` at the project root.

**Key Configuration:**
- **Mutate**: Targets critical services (auth, payment, deployment-pipeline)
- **Test Runner**: Vitest
- **Reporters**: HTML, JSON, and clear-text output
- **Thresholds**: 80% high, 70% medium, 60% low
- **Timeout**: 5 seconds per test with 1.25x factor

## Running Mutation Tests

### Full Mutation Test Suite

```bash
npx stryker run
```

### Dry Run (Preview mutations without running tests)

```bash
npx stryker run --dryRun
```

### Incremental Testing

```bash
npx stryker run --incremental
```

## Understanding Results

### Mutation Score

The mutation score indicates the percentage of mutations killed (caught) by tests:

- **Killed**: Test caught the mutation (good)
- **Survived**: Test missed the mutation (bad - indicates weak test)
- **Timeout**: Mutation caused infinite loop
- **Compile Error**: Mutation caused syntax error

### Example Output

```
Mutation score: 85.5%
Killed: 171
Survived: 29
Timeout: 2
Compile errors: 0
```

## Critical Services

### 1. Auth Service (`auth.service.ts`)

**Target Score**: 90%+

**Key Mutations to Catch:**
- Error handling in signup/signin
- Session token validation
- Profile creation failures
- JWT expiry checks
- RLS policy enforcement

**Tests**: `auth.service.test.ts`, `auth.integration.test.ts`

### 2. Payment Service (`payment.service.ts`)

**Target Score**: 85%+

**Key Mutations to Catch:**
- Subscription tier validation
- Payment status transitions
- Refund logic
- Stripe API error handling
- Billing cycle calculations

**Tests**: `payment.service.test.ts`

### 3. Deployment Pipeline Service (`deployment-pipeline.service.ts`)

**Target Score**: 80%+

**Key Mutations to Catch:**
- Deployment status progression
- GitHub/Vercel API calls
- Rollback logic
- Rate limit handling
- Database transaction management

**Tests**: `deployment-pipeline.service.test.ts`

## Improving Mutation Score

### 1. Identify Surviving Mutants

Review the HTML report at `mutation-test-results/index.html` to see which mutations survived.

### 2. Add Missing Tests

For each surviving mutant, add a test that would catch it:

```typescript
// Example: Test for boundary condition
it('should reject invalid subscription tier', () => {
  expect(() => validateTier('invalid')).toThrow();
});
```

### 3. Strengthen Assertions

Ensure tests verify both positive and negative cases:

```typescript
// Weak test
expect(result).toBeDefined();

// Strong test
expect(result).toBeDefined();
expect(result.status).toBe('success');
expect(result.data).toEqual(expectedData);
```

### 4. Test Edge Cases

Add tests for boundary conditions and error scenarios:

```typescript
it('should handle null values', () => {
  expect(service.process(null)).toThrow();
});

it('should handle empty arrays', () => {
  expect(service.process([])).toEqual([]);
});
```

## Acceptable Survivors

Some mutations may be acceptable survivors if they represent:

1. **Cosmetic changes** (e.g., variable naming)
2. **Unreachable code** (e.g., after throw statements)
3. **Defensive programming** (e.g., redundant null checks)

Document these in the mutation report with explanations.

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run mutation tests
  run: npx stryker run
  
- name: Upload mutation report
  uses: actions/upload-artifact@v2
  with:
    name: mutation-report
    path: mutation-test-results/
```

### Fail on Low Score

```bash
npx stryker run --thresholds.high=80 --thresholds.medium=70
```

## Performance Considerations

- Mutation testing is slower than unit testing (5-10x slower)
- Run on CI/CD, not on every local test
- Use incremental mode for faster iterations
- Consider running only on critical services

## Troubleshooting

### Tests Timeout

Increase `timeoutMS` in `stryker.conf.json`:

```json
{
  "timeoutMS": 10000,
  "timeoutFactor": 1.5
}
```

### Out of Memory

Reduce `maxConcurrentTestRunners`:

```json
{
  "maxConcurrentTestRunners": 2
}
```

### Stale Results

Clear incremental cache:

```bash
rm .stryker-incremental.json
npx stryker run
```

## Resources

- [Stryker Documentation](https://stryker-mutator.io/)
- [Mutation Testing Best Practices](https://stryker-mutator.io/docs/mutation-testing-elements/mutation-operators/)
- [Vitest Integration](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)

## Maintenance

- Review mutation scores quarterly
- Update tests when new features are added
- Monitor for performance regressions
- Keep Stryker and dependencies updated
