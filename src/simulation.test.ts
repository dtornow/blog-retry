import {
  createSeededRandom,
  runSimulation,
  compareSimulations,
} from './simulation.js';
import type { Program, FailureConfig } from './types.js';

describe('createSeededRandom', () => {
  it('produces deterministic sequence for same seed', () => {
    const random1 = createSeededRandom(42);
    const random2 = createSeededRandom(42);

    const seq1 = [random1(), random1(), random1()];
    const seq2 = [random2(), random2(), random2()];

    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const random1 = createSeededRandom(42);
    const random2 = createSeededRandom(123);

    expect(random1()).not.toBe(random2());
  });

  it('produces values in [0, 1) range', () => {
    const random = createSeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('runSimulation', () => {
  const program: Program = [
    { duration: 5 },
    { duration: 5 },
    { duration: 5 },
  ];

  const config: FailureConfig = {
    poissonRate: 0.01,
    timeout: 100,
  };

  it('returns correct structure', () => {
    const result = runSimulation(program, config, 'no-checkpoint', 10, 10, 42);

    expect(result.testsRun).toBe(10);
    expect(result.successes).toBeGreaterThanOrEqual(0);
    expect(result.successes).toBeLessThanOrEqual(10);
    expect(result.successRate).toBe(result.successes / result.testsRun);
    expect(result.avgTotalTime).toBeGreaterThan(0);
    expect(result.avgAttempts).toBeGreaterThanOrEqual(1);
    expect(result.attemptDistribution).toBeInstanceOf(Map);
  });

  it('produces reproducible results with seed', () => {
    const result1 = runSimulation(program, config, 'no-checkpoint', 100, 10, 42);
    const result2 = runSimulation(program, config, 'no-checkpoint', 100, 10, 42);

    expect(result1.successes).toBe(result2.successes);
    expect(result1.avgTotalTime).toBe(result2.avgTotalTime);
    expect(result1.avgAttempts).toBe(result2.avgAttempts);
  });

  it('has all successes when failure is impossible', () => {
    const noFailConfig: FailureConfig = {
      poissonRate: 0,
      timeout: 1000,
    };

    const result = runSimulation(program, noFailConfig, 'no-checkpoint', 100, 10, 42);
    expect(result.successes).toBe(100);
    expect(result.successRate).toBe(1);
    expect(result.avgAttempts).toBe(1);
  });

  it('attempt distribution sums to testsRun', () => {
    const result = runSimulation(program, config, 'no-checkpoint', 100, 10, 42);

    let sum = 0;
    for (const count of result.attemptDistribution.values()) {
      sum += count;
    }
    expect(sum).toBe(100);
  });
});

describe('compareSimulations', () => {
  const program: Program = [
    { duration: 5 },
    { duration: 5 },
    { duration: 5 },
    { duration: 5 },
    { duration: 5 },
  ];

  it('returns both modes', () => {
    const config: FailureConfig = {
      poissonRate: 0.02,
      timeout: 100,
    };

    const comparison = compareSimulations(program, config, 100, 50, 42);

    expect(comparison.noCheckpoint).toBeDefined();
    expect(comparison.withCheckpoint).toBeDefined();
    expect(comparison.noCheckpoint.testsRun).toBe(100);
    expect(comparison.withCheckpoint.testsRun).toBe(100);
  });

  it('checkpoint mode uses less time on average (with retries)', () => {
    // High failure rate to force retries
    const config: FailureConfig = {
      poissonRate: 0.05,
      timeout: 100,
    };

    const comparison = compareSimulations(program, config, 500, 50, 42);

    // With checkpointing, we don't redo successful work on retry
    // So average time should be lower (or equal in edge cases)
    expect(comparison.withCheckpoint.avgTotalTime).toBeLessThanOrEqual(
      comparison.noCheckpoint.avgTotalTime
    );
  });

  it('checkpoint mode has equal or higher success rate', () => {
    const config: FailureConfig = {
      poissonRate: 0.03,
      timeout: 100,
    };

    const comparison = compareSimulations(program, config, 500, 50, 42);

    expect(comparison.withCheckpoint.successRate).toBeGreaterThanOrEqual(
      comparison.noCheckpoint.successRate
    );
  });

  it('shows dramatic difference with tight timeout', () => {
    // Timeout that allows individual calls but not full program
    const config: FailureConfig = {
      poissonRate: 0,
      timeout: 20, // Each call is 5, total is 25
    };

    const comparison = compareSimulations(program, config, 100, 50, 42);

    // Without checkpoint: total 25 > timeout 20, always fails
    expect(comparison.noCheckpoint.successRate).toBe(0);

    // With checkpoint: each call 5 < timeout 20, always succeeds
    expect(comparison.withCheckpoint.successRate).toBe(1);
  });
});
