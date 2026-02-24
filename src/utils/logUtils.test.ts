import { getTimestamp, log, logError } from './logUtils';

describe('LogUtils', () => {
  // Store original console methods
  const originalLog = console.log;
  const originalError = console.error;

  // Mock console methods
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('getTimestamp', () => {
    it('should return formatted timestamp with milliseconds', () => {
      const timestamp = getTimestamp();

      // Format: YYYY-MM-DD HH:MM:SS.mmm
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    });

    it('should pad milliseconds to 3 digits', () => {
      const timestamp = getTimestamp();
      const milliseconds = timestamp.split('.')[1];

      expect(milliseconds).toHaveLength(3);
    });

    it('should return different timestamps for sequential calls', (done) => {
      const timestamp1 = getTimestamp();

      setTimeout(() => {
        const timestamp2 = getTimestamp();
        // Timestamps should be different (at least milliseconds)
        expect(timestamp2).not.toBe(timestamp1);
        done();
      }, 5);
    });
  });

  describe('log', () => {
    it('should log message with timestamp and source', () => {
      log('TestSource', 'Test message');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = logSpy.mock.calls[0][0];

      expect(loggedMessage).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[TestSource\] Test message$/);
    });

    it('should log message with data', () => {
      const data = { count: 42, name: 'test' };
      log('TestSource', 'Test message', data);

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[TestSource\] Test message$/),
        data
      );
    });

    it('should handle different source identifiers', () => {
      log('FileOps', 'File operation');
      log('TreeProvider', 'Tree update');
      log('FileWatcher', 'File changed');

      expect(logSpy).toHaveBeenCalledTimes(3);
      expect(logSpy.mock.calls[0][0]).toContain('[FileOps]');
      expect(logSpy.mock.calls[1][0]).toContain('[TreeProvider]');
      expect(logSpy.mock.calls[2][0]).toContain('[FileWatcher]');
    });
  });

  describe('logError', () => {
    it('should log error message with timestamp, ERROR tag, and source', () => {
      logError('TestSource', 'Error occurred');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = errorSpy.mock.calls[0][0];

      expect(loggedMessage).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[ERROR\] \[TestSource\] Error occurred$/);
    });

    it('should log error with error object', () => {
      const error = new Error('Test error');
      logError('TestSource', 'Operation failed', error);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[ERROR\] \[TestSource\] Operation failed$/),
        error
      );
    });

    it('should handle different error types', () => {
      logError('FileOps', 'File read failed', new Error('ENOENT'));
      logError('Parser', 'Parse error', { message: 'Invalid JSON' });
      logError('Network', 'Request failed', 'Network timeout');

      expect(errorSpy).toHaveBeenCalledTimes(3);
    });
  });
});
