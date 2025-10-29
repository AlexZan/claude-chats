import { safeExecute, safeExecuteAsync, silentExecute } from './errorHandler';

describe('ErrorHandler', () => {
  // Mock console.error
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('safeExecute', () => {
    it('should return function result if successful', () => {
      const result = safeExecute(
        () => 42,
        0,
        'TestSource'
      );

      expect(result).toBe(42);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should return fallback value if function throws', () => {
      const result = safeExecute(
        () => {
          throw new Error('Test error');
        },
        0,
        'TestSource'
      );

      expect(result).toBe(0);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should log error with source', () => {
      safeExecute(
        () => {
          throw new Error('Test error');
        },
        null,
        'FileOps'
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const firstArg = errorSpy.mock.calls[0][0];
      const secondArg = errorSpy.mock.calls[0][1];

      expect(firstArg).toContain('[FileOps]');
      expect(firstArg).toContain('Operation failed');
      expect(secondArg).toBeInstanceOf(Error);
    });

    it('should log error with context', () => {
      safeExecute(
        () => {
          throw new Error('Parse error');
        },
        null,
        'Parser',
        'Parsing JSON line'
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const firstArg = errorSpy.mock.calls[0][0];
      const secondArg = errorSpy.mock.calls[0][1];

      expect(firstArg).toContain('[Parser]');
      expect(firstArg).toContain('Parsing JSON line');
      expect(secondArg).toBeInstanceOf(Error);
    });

    it('should handle different fallback types', () => {
      const stringResult = safeExecute(() => { throw new Error(); }, '', 'Test');
      const numberResult = safeExecute(() => { throw new Error(); }, 0, 'Test');
      const arrayResult = safeExecute(() => { throw new Error(); }, [], 'Test');
      const objectResult = safeExecute(() => { throw new Error(); }, {}, 'Test');

      expect(stringResult).toBe('');
      expect(numberResult).toBe(0);
      expect(arrayResult).toEqual([]);
      expect(objectResult).toEqual({});
    });

    it('should work with complex return types', () => {
      const result = safeExecute(
        () => ({ name: 'test', count: 42 }),
        { name: '', count: 0 },
        'Test'
      );

      expect(result).toEqual({ name: 'test', count: 42 });
    });
  });

  describe('safeExecuteAsync', () => {
    it('should return async function result if successful', async () => {
      const result = await safeExecuteAsync(
        async () => Promise.resolve(42),
        0,
        'TestSource'
      );

      expect(result).toBe(42);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should return fallback value if async function throws', async () => {
      const result = await safeExecuteAsync(
        async () => {
          throw new Error('Async error');
        },
        0,
        'TestSource'
      );

      expect(result).toBe(0);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should log error with source', async () => {
      await safeExecuteAsync(
        async () => {
          throw new Error('Async error');
        },
        null,
        'FileOps'
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const firstArg = errorSpy.mock.calls[0][0];
      const secondArg = errorSpy.mock.calls[0][1];

      expect(firstArg).toContain('[FileOps]');
      expect(firstArg).toContain('Async operation failed');
      expect(secondArg).toBeInstanceOf(Error);
    });

    it('should log error with context', async () => {
      await safeExecuteAsync(
        async () => {
          throw new Error('Network error');
        },
        '',
        'NetworkService',
        'Fetching data from API'
      );

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const firstArg = errorSpy.mock.calls[0][0];
      const secondArg = errorSpy.mock.calls[0][1];

      expect(firstArg).toContain('[NetworkService]');
      expect(firstArg).toContain('Fetching data from API');
      expect(secondArg).toBeInstanceOf(Error);
    });

    it('should handle rejected promises', async () => {
      const result = await safeExecuteAsync(
        () => Promise.reject(new Error('Promise rejected')),
        'fallback',
        'Test'
      );

      expect(result).toBe('fallback');
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should work with complex async operations', async () => {
      const result = await safeExecuteAsync(
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { data: 'success' };
        },
        { data: 'error' },
        'Test'
      );

      expect(result).toEqual({ data: 'success' });
    });
  });

  describe('silentExecute', () => {
    it('should return function result if successful', () => {
      const result = silentExecute(() => 42, 0);

      expect(result).toBe(42);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should return fallback value if function throws', () => {
      const result = silentExecute(
        () => {
          throw new Error('Silent error');
        },
        0
      );

      expect(result).toBe(0);
      expect(errorSpy).not.toHaveBeenCalled(); // Should NOT log
    });

    it('should not log errors', () => {
      silentExecute(() => { throw new Error(); }, null);
      silentExecute(() => { throw new Error(); }, null);
      silentExecute(() => { throw new Error(); }, null);

      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should be useful for skipping malformed lines', () => {
      const lines = [
        '{"valid": "json"}',
        '{invalid json}',
        '{"another": "valid"}'
      ];

      const parsed = lines.map(line =>
        silentExecute(() => JSON.parse(line), null)
      ).filter(item => item !== null);

      expect(parsed).toHaveLength(2);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should handle different fallback types', () => {
      const stringResult = silentExecute(() => { throw new Error(); }, '');
      const numberResult = silentExecute(() => { throw new Error(); }, 0);
      const booleanResult = silentExecute(() => { throw new Error(); }, false);

      expect(stringResult).toBe('');
      expect(numberResult).toBe(0);
      expect(booleanResult).toBe(false);
    });
  });
});
