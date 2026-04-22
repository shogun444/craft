import { describe, it, expect } from 'vitest';
import { fc } from '@fast-check/vitest';
import { sanitizeRepoName } from './github.service';

/**
 * Property-Based Tests for GitHub Repository Name Sanitization
 * 
 * Uses fast-check to verify that repository name sanitization handles all edge cases
 * correctly and never produces invalid GitHub repository names.
 * 
 * Properties tested:
 * 1. Output is always a valid GitHub repository name
 * 2. Valid names are preserved unchanged (idempotency)
 * 3. Sanitization is idempotent (sanitizing twice = sanitizing once)
 * 4. Length constraints are respected
 * 5. Collision suffix generation maintains validity
 */

// GitHub repository name validation rules
const GITHUB_REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const MAX_REPO_NAME_LENGTH = 100;

/**
 * Validates if a string is a valid GitHub repository name
 */
function isValidGitHubRepoName(name: string): boolean {
  if (!name || name.length === 0) return false;
  if (name.length > MAX_REPO_NAME_LENGTH) return false;
  if (!GITHUB_REPO_NAME_REGEX.test(name)) return false;
  if (name.startsWith('.')) return false;
  if (name.endsWith('.') || name.endsWith('-') || name.endsWith('_')) return false;
  if (name.includes('--') || name.includes('__')) return false;
  return true;
}

describe('GitHub Repository Name Sanitization - Property-Based Tests', () => {
  describe('Property: Output is always valid GitHub repo name', () => {
    it(
      'should produce valid GitHub repo names for arbitrary strings',
      fc.property(fc.string(), (input) => {
        const result = sanitizeRepoName(input);
        expect(isValidGitHubRepoName(result)).toBe(true);
      }),
      { numRuns: 1000 }
    );

    it(
      'should handle unicode characters',
      fc.property(fc.unicode(), (input) => {
        const result = sanitizeRepoName(input);
        expect(isValidGitHubRepoName(result)).toBe(true);
      }),
      { numRuns: 1000 }
    );

    it(
      'should handle special characters',
      fc.property(
        fc.stringOf(fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '=', '+', '[', ']', '{', '}', '|', ';', ':', ',', '<', '>', '?', '/')),
        (input) => {
          const result = sanitizeRepoName(input);
          expect(isValidGitHubRepoName(result)).toBe(true);
        }
      ),
      { numRuns: 500 }
    );

    it(
      'should handle whitespace characters',
      fc.property(fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r')), (input) => {
        const result = sanitizeRepoName(input);
        expect(isValidGitHubRepoName(result)).toBe(true);
      }),
      { numRuns: 500 }
    );

    it(
      'should handle mixed case and numbers',
      fc.property(fc.string({ minLength: 1 }), (input) => {
        const result = sanitizeRepoName(input);
        expect(isValidGitHubRepoName(result)).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });

  describe('Property: Valid names are preserved unchanged', () => {
    it(
      'should preserve valid alphanumeric names',
      fc.property(fc.regex(/^[a-zA-Z0-9]+$/), (input) => {
        if (input.length === 0) return true; // Skip empty strings
        const result = sanitizeRepoName(input);
        expect(result).toBe(input);
      }),
      { numRuns: 500 }
    );

    it(
      'should preserve valid names with hyphens',
      fc.property(fc.regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/), (input) => {
        if (input.length === 0) return true;
        const result = sanitizeRepoName(input);
        expect(result).toBe(input);
      }),
      { numRuns: 500 }
    );

    it(
      'should preserve valid names with underscores',
      fc.property(fc.regex(/^[a-zA-Z0-9_]+$/), (input) => {
        if (input.length === 0) return true;
        const result = sanitizeRepoName(input);
        expect(result).toBe(input);
      }),
      { numRuns: 500 }
    );

    it(
      'should preserve valid names with dots',
      fc.property(fc.regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/), (input) => {
        if (input.length === 0) return true;
        const result = sanitizeRepoName(input);
        expect(result).toBe(input);
      }),
      { numRuns: 500 }
    );
  });

  describe('Property: Sanitization is idempotent', () => {
    it(
      'should produce same result when sanitized twice',
      fc.property(fc.string(), (input) => {
        const first = sanitizeRepoName(input);
        const second = sanitizeRepoName(first);
        expect(first).toBe(second);
      }),
      { numRuns: 1000 }
    );

    it(
      'should produce same result when sanitized multiple times',
      fc.property(fc.string(), (input) => {
        const first = sanitizeRepoName(input);
        const second = sanitizeRepoName(first);
        const third = sanitizeRepoName(second);
        const fourth = sanitizeRepoName(third);
        expect(first).toBe(second);
        expect(second).toBe(third);
        expect(third).toBe(fourth);
      }),
      { numRuns: 500 }
    );
  });

  describe('Property: Length constraints are respected', () => {
    it(
      'should never exceed maximum length',
      fc.property(fc.string(), (input) => {
        const result = sanitizeRepoName(input);
        expect(result.length).toBeLessThanOrEqual(MAX_REPO_NAME_LENGTH);
      }),
      { numRuns: 1000 }
    );

    it(
      'should handle very long strings',
      fc.property(fc.string({ minLength: 1000, maxLength: 10000 }), (input) => {
        const result = sanitizeRepoName(input);
        expect(result.length).toBeLessThanOrEqual(MAX_REPO_NAME_LENGTH);
        expect(isValidGitHubRepoName(result)).toBe(true);
      }),
      { numRuns: 100 }
    );

    it(
      'should preserve length for valid short names',
      fc.property(fc.string({ minLength: 1, maxLength: 50 }).filter((s) => /^[a-zA-Z0-9._-]+$/.test(s) && !s.startsWith('.') && !s.endsWith('.') && !s.endsWith('-')), (input) => {
        const result = sanitizeRepoName(input);
        expect(result.length).toBeLessThanOrEqual(input.length);
      }),
      { numRuns: 500 }
    );
  });

  describe('Property: Collision suffix generation maintains validity', () => {
    it(
      'should produce valid names with numeric suffixes',
      fc.property(fc.string(), fc.integer({ min: 1, max: 10 }), (input, suffix) => {
        const sanitized = sanitizeRepoName(input);
        const withSuffix = `${sanitized}-${suffix}`;
        // Verify the suffix doesn't break validity
        expect(isValidGitHubRepoName(withSuffix) || withSuffix.length > MAX_REPO_NAME_LENGTH).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = sanitizeRepoName('');
      expect(result).toBe('repo');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle only special characters', () => {
      const result = sanitizeRepoName('!@#$%^&*()');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle only whitespace', () => {
      const result = sanitizeRepoName('   \t\n  ');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle leading dots', () => {
      const result = sanitizeRepoName('...my-repo');
      expect(result).toBe('my-repo');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle trailing dots', () => {
      const result = sanitizeRepoName('my-repo...');
      expect(result).toBe('my-repo');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle trailing hyphens', () => {
      const result = sanitizeRepoName('my-repo---');
      expect(result).toBe('my-repo');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle trailing underscores', () => {
      const result = sanitizeRepoName('my_repo___');
      expect(result).toBe('my_repo');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should collapse consecutive hyphens', () => {
      const result = sanitizeRepoName('my---repo');
      expect(result).toBe('my-repo');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle mixed consecutive special chars', () => {
      const result = sanitizeRepoName('my-_-_repo');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle unicode normalization', () => {
      const result = sanitizeRepoName('café-repo');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle emoji', () => {
      const result = sanitizeRepoName('my-repo-🚀');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle CJK characters', () => {
      const result = sanitizeRepoName('我的-repo-中文');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle very long names with special chars', () => {
      const longName = 'a'.repeat(500) + '!@#$%' + 'b'.repeat(500);
      const result = sanitizeRepoName(longName);
      expect(result.length).toBeLessThanOrEqual(MAX_REPO_NAME_LENGTH);
      expect(isValidGitHubRepoName(result)).toBe(true);
    });

    it('should handle names that become empty after sanitization', () => {
      const result = sanitizeRepoName('!@#$%^&*()');
      expect(result).not.toBe('');
      expect(isValidGitHubRepoName(result)).toBe(true);
    });
  });

  describe('Discovered Edge Cases Documentation', () => {
    it('documents: consecutive hyphens are collapsed', () => {
      // When input contains multiple consecutive hyphens, they are collapsed to single hyphen
      expect(sanitizeRepoName('my---repo')).toBe('my-repo');
    });

    it('documents: leading dots are stripped', () => {
      // GitHub forbids repository names starting with dots
      expect(sanitizeRepoName('.my-repo')).toBe('my-repo');
    });

    it('documents: trailing special chars are stripped', () => {
      // Trailing hyphens, underscores, and dots are removed
      expect(sanitizeRepoName('my-repo-')).toBe('my-repo');
      expect(sanitizeRepoName('my_repo_')).toBe('my_repo');
      expect(sanitizeRepoName('my.repo.')).toBe('my.repo');
    });

    it('documents: non-alphanumeric chars (except -_.) become hyphens', () => {
      // Special characters are replaced with hyphens
      expect(sanitizeRepoName('my@repo')).toBe('my-repo');
      expect(sanitizeRepoName('my repo')).toBe('my-repo');
    });

    it('documents: empty input defaults to "repo"', () => {
      // Empty strings after sanitization default to "repo"
      expect(sanitizeRepoName('')).toBe('repo');
      expect(sanitizeRepoName('!@#$')).toBe('repo');
    });

    it('documents: names are truncated to 100 chars', () => {
      // GitHub has a 100 character limit
      const longName = 'a'.repeat(150);
      const result = sanitizeRepoName(longName);
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });
});
