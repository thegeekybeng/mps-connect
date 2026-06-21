import { describe, it, expect } from 'vitest';
import { logger } from './logger';

describe('Logger', () => {
  it('should be defined', () => {
    expect(logger).toBeDefined();
  });
  
  it('should have basic logging methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
