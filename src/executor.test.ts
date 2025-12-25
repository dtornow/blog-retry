import { executeAttempt, runTest } from './executor.js';
import type { Program, FailureConfig } from './types.js';

describe('executeAttempt', () => {
  const config: FailureConfig = {
    poissonRate: 0.1,
    timeout: 100,
  };

  const program: Program = [
    { duration: 10 },
    { duration: 10 },
    { duration: 10 },
  ];

  describe('successful execution', () => {
    it('completes all calls when random always returns 0', () => {
      const result = executeAttempt(program, 0, config, 'no-checkpoint', () => 0);
      expect(result.success).toBe(true);
      expect(result.callsCompleted).toBe(3);
      expect(result.timeSpent).toBe(30);
      expect(result.failedAtCallIndex).toBeUndefined();
    });

    it('skips calls before startIndex', () => {
      const result = executeAttempt(program, 2, config, 'with-checkpoint', () => 0);
      expect(result.success).toBe(true);
      expect(result.callsCompleted).toBe(3);
      expect(result.timeSpent).toBe(10); // Only the last call
    });
  });

  describe('failed execution', () => {
    it('fails on first call with high random value', () => {
      const result = executeAttempt(program, 0, config, 'no-checkpoint', () => 0.99);
      expect(result.success).toBe(false);
      expect(result.callsCompleted).toBe(0);
      expect(result.failedAtCallIndex).toBe(0);
      expect(result.timeSpent).toBe(10);
    });

    it('records correct failure index', () => {
      // Succeed first two, fail third
      let callCount = 0;
      const random = () => {
        callCount++;
        return callCount <= 2 ? 0 : 0.99;
      };

      const result = executeAttempt(program, 0, config, 'no-checkpoint', random);
      expect(result.success).toBe(false);
      expect(result.callsCompleted).toBe(2);
      expect(result.failedAtCallIndex).toBe(2);
      expect(result.timeSpent).toBe(30);
    });
  });

  describe('timeout behavior', () => {
    const strictConfig: FailureConfig = {
      poissonRate: 0,
      timeout: 25, // Can fit 2 calls but not 3
    };

    it('fails in no-checkpoint mode when total exceeds timeout', () => {
      const result = executeAttempt(program, 0, strictConfig, 'no-checkpoint', () => 0);
      expect(result.success).toBe(false);
      expect(result.callsCompleted).toBe(2);
      expect(result.failedAtCallIndex).toBe(2);
    });

    it('succeeds in checkpoint mode when each call fits', () => {
      const result = executeAttempt(program, 0, strictConfig, 'with-checkpoint', () => 0);
      expect(result.success).toBe(true);
      expect(result.callsCompleted).toBe(3);
    });
  });
});

describe('runTest', () => {
  const config: FailureConfig = {
    poissonRate: 0.1,
    timeout: 100,
  };

  const program: Program = [
    { duration: 10 },
    { duration: 10 },
    { duration: 10 },
  ];

  describe('successful completion', () => {
    it('succeeds on first attempt with no failures', () => {
      const result = runTest(program, config, 'no-checkpoint', 10, () => 0);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.totalTime).toBe(30);
    });
  });

  describe('retry behavior', () => {
    it('retries until success', () => {
      let attemptCount = 0;
      const random = () => {
        attemptCount++;
        // Fail first 3 attempts, succeed on 4th
        return attemptCount <= 3 ? 0.99 : 0;
      };

      const result = runTest(program, config, 'no-checkpoint', 10, random);
      expect(result.success).toBe(true);
      // First 3 fail on first call, 4th succeeds all 3 calls
      // So we need attempts = 4, and random is called 3 + 3 = 6 times
    });

    it('respects maxAttempts limit', () => {
      const result = runTest(program, config, 'no-checkpoint', 5, () => 0.99);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(5);
    });
  });

  describe('checkpointing', () => {
    it('resumes from high watermark in checkpoint mode', () => {
      let callIndex = 0;
      // Fail on call index 1, then succeed everything
      const random = () => {
        callIndex++;
        // Calls: 1(pass), 2(fail), 2(pass), 3(pass)
        return callIndex === 2 ? 0.99 : 0;
      };

      const result = runTest(program, config, 'with-checkpoint', 10, random);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      // Attempt 1: 10 + 10 (fail) = 20
      // Attempt 2: 10 + 10 = 20 (resume from index 1)
      expect(result.totalTime).toBe(40);
    });

    it('restarts from beginning in no-checkpoint mode', () => {
      let callIndex = 0;
      // Fail on call index 1, then succeed everything
      const random = () => {
        callIndex++;
        // Calls: 1(pass), 2(fail), 1(pass), 2(pass), 3(pass)
        return callIndex === 2 ? 0.99 : 0;
      };

      const result = runTest(program, config, 'no-checkpoint', 10, random);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      // Attempt 1: 10 + 10 (fail) = 20
      // Attempt 2: 10 + 10 + 10 = 30 (restart from beginning)
      expect(result.totalTime).toBe(50);
    });
  });

  describe('high watermark tracking', () => {
    it('tracks furthest progress', () => {
      let attemptCount = 0;
      // Attempt 1: complete 2 calls, fail on 3rd
      // Attempt 2: succeed all
      const random = () => {
        attemptCount++;
        // Fail on 3rd call of first attempt
        return attemptCount === 3 ? 0.99 : 0;
      };

      const result = runTest(program, config, 'with-checkpoint', 10, random);
      expect(result.highWatermark).toBe(3);
    });
  });
});
