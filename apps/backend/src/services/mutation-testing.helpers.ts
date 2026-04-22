/**
 * Mutation Testing Helpers
 * 
 * Utilities to support mutation testing and improve test quality
 * for critical services.
 */

/**
 * Asserts that a function throws an error with a specific message
 */
export function expectThrowWithMessage(
  fn: () => void | Promise<void>,
  expectedMessage: string | RegExp
): void {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof expectedMessage === 'string') {
      if (!message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to include "${expectedMessage}", got "${message}"`
        );
      }
    } else {
      if (!expectedMessage.test(message)) {
        throw new Error(
          `Expected error message to match ${expectedMessage}, got "${message}"`
        );
      }
    }
  }
}

/**
 * Asserts that a value is within a range
 */
export function expectInRange(value: number, min: number, max: number): void {
  if (value < min || value > max) {
    throw new Error(`Expected ${value} to be between ${min} and ${max}`);
  }
}

/**
 * Asserts that a value is not null or undefined
 */
export function expectDefined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be defined');
  }
  return value;
}

/**
 * Asserts that two values are deeply equal
 */
export function expectDeepEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`
    );
  }
}

/**
 * Asserts that a value is truthy
 */
export function expectTruthy(value: unknown): void {
  if (!value) {
    throw new Error(`Expected ${value} to be truthy`);
  }
}

/**
 * Asserts that a value is falsy
 */
export function expectFalsy(value: unknown): void {
  if (value) {
    throw new Error(`Expected ${value} to be falsy`);
  }
}

/**
 * Asserts that a value is of a specific type
 */
export function expectType(value: unknown, type: string): void {
  if (typeof value !== type) {
    throw new Error(`Expected type ${type}, got ${typeof value}`);
  }
}

/**
 * Asserts that an array contains a specific value
 */
export function expectIncludes<T>(array: T[], value: T): void {
  if (!array.includes(value)) {
    throw new Error(`Expected array to include ${value}`);
  }
}

/**
 * Asserts that an array does not contain a specific value
 */
export function expectNotIncludes<T>(array: T[], value: T): void {
  if (array.includes(value)) {
    throw new Error(`Expected array not to include ${value}`);
  }
}

/**
 * Asserts that a string matches a pattern
 */
export function expectMatches(value: string, pattern: RegExp): void {
  if (!pattern.test(value)) {
    throw new Error(`Expected "${value}" to match ${pattern}`);
  }
}

/**
 * Asserts that a string does not match a pattern
 */
export function expectNotMatches(value: string, pattern: RegExp): void {
  if (pattern.test(value)) {
    throw new Error(`Expected "${value}" not to match ${pattern}`);
  }
}

/**
 * Asserts that a value is greater than another
 */
export function expectGreaterThan(value: number, threshold: number): void {
  if (value <= threshold) {
    throw new Error(`Expected ${value} to be greater than ${threshold}`);
  }
}

/**
 * Asserts that a value is less than another
 */
export function expectLessThan(value: number, threshold: number): void {
  if (value >= threshold) {
    throw new Error(`Expected ${value} to be less than ${threshold}`);
  }
}

/**
 * Asserts that a value is greater than or equal to another
 */
export function expectGreaterThanOrEqual(value: number, threshold: number): void {
  if (value < threshold) {
    throw new Error(`Expected ${value} to be >= ${threshold}`);
  }
}

/**
 * Asserts that a value is less than or equal to another
 */
export function expectLessThanOrEqual(value: number, threshold: number): void {
  if (value > threshold) {
    throw new Error(`Expected ${value} to be <= ${threshold}`);
  }
}

/**
 * Asserts that an object has a specific property
 */
export function expectHasProperty<T extends object>(
  obj: T,
  property: keyof T
): void {
  if (!(property in obj)) {
    throw new Error(`Expected object to have property ${String(property)}`);
  }
}

/**
 * Asserts that an object does not have a specific property
 */
export function expectNotHasProperty<T extends object>(
  obj: T,
  property: keyof T
): void {
  if (property in obj) {
    throw new Error(`Expected object not to have property ${String(property)}`);
  }
}

/**
 * Asserts that a value is an instance of a class
 */
export function expectInstanceOf<T>(value: unknown, constructor: new (...args: unknown[]) => T): void {
  if (!(value instanceof constructor)) {
    throw new Error(`Expected value to be instance of ${constructor.name}`);
  }
}

/**
 * Asserts that a value is not an instance of a class
 */
export function expectNotInstanceOf<T>(value: unknown, constructor: new (...args: unknown[]) => T): void {
  if (value instanceof constructor) {
    throw new Error(`Expected value not to be instance of ${constructor.name}`);
  }
}

/**
 * Asserts that a function is called with specific arguments
 */
export function expectCalledWith<T extends unknown[]>(
  calls: T[],
  expectedArgs: T
): void {
  const found = calls.some((call) => JSON.stringify(call) === JSON.stringify(expectedArgs));
  if (!found) {
    throw new Error(`Expected function to be called with ${JSON.stringify(expectedArgs)}`);
  }
}

/**
 * Asserts that a function is called a specific number of times
 */
export function expectCallCount(callCount: number, expectedCount: number): void {
  if (callCount !== expectedCount) {
    throw new Error(`Expected function to be called ${expectedCount} times, got ${callCount}`);
  }
}

/**
 * Asserts that a value is a valid email
 */
export function expectValidEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error(`Expected "${email}" to be a valid email`);
  }
}

/**
 * Asserts that a value is a valid UUID
 */
export function expectValidUUID(uuid: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new Error(`Expected "${uuid}" to be a valid UUID`);
  }
}

/**
 * Asserts that a value is a valid URL
 */
export function expectValidURL(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new Error(`Expected "${url}" to be a valid URL`);
  }
}

/**
 * Asserts that a value is a valid ISO date string
 */
export function expectValidISODate(dateString: string): void {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error(`Expected "${dateString}" to be a valid ISO date`);
  }
}

/**
 * Asserts that a date is in the past
 */
export function expectDateInPast(date: Date): void {
  if (date.getTime() >= Date.now()) {
    throw new Error(`Expected date to be in the past`);
  }
}

/**
 * Asserts that a date is in the future
 */
export function expectDateInFuture(date: Date): void {
  if (date.getTime() <= Date.now()) {
    throw new Error(`Expected date to be in the future`);
  }
}

/**
 * Asserts that a value is a valid subscription tier
 */
export function expectValidSubscriptionTier(tier: string): void {
  const validTiers = ['free', 'starter', 'pro', 'enterprise'];
  if (!validTiers.includes(tier)) {
    throw new Error(`Expected "${tier}" to be a valid subscription tier`);
  }
}

/**
 * Asserts that a value is a valid deployment status
 */
export function expectValidDeploymentStatus(status: string): void {
  const validStatuses = ['pending', 'building', 'completed', 'failed'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Expected "${status}" to be a valid deployment status`);
  }
}
