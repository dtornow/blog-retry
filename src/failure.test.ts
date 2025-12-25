import {
  checkFailure,
  survivalProbability,
  failureProbability,
} from './failure.js';
import type { FailureConfig } from './types.js';

describe('survivalProbability', () => {
  it('returns 1 for zero duration', () => {
    expect(survivalProbability(0, 0.1)).toBe(1);
  });

  it('returns e^(-λt) for given duration and rate', () => {
    // λ=0.1, t=10 → e^(-1) ≈ 0.3679
    expect(survivalProbability(10, 0.1)).toBeCloseTo(Math.exp(-1), 5);
  });

  it('decreases with longer duration', () => {
    const short = survivalProbability(5, 0.1);
    const long = survivalProbability(10, 0.1);
    expect(long).toBeLessThan(short);
  });

  it('decreases with higher rate', () => {
    const lowRate = survivalProbability(10, 0.05);
    const highRate = survivalProbability(10, 0.1);
    expect(highRate).toBeLessThan(lowRate);
  });
});

describe('failureProbability', () => {
  it('returns 0 for zero duration', () => {
    expect(failureProbability(0, 0.1)).toBe(0);
  });

  it('returns 1 - survival probability', () => {
    const survival = survivalProbability(10, 0.1);
    const failure = failureProbability(10, 0.1);
    expect(failure).toBeCloseTo(1 - survival, 10);
  });

  it('increases with longer duration', () => {
    const short = failureProbability(5, 0.1);
    const long = failureProbability(10, 0.1);
    expect(long).toBeGreaterThan(short);
  });
});

describe('checkFailure', () => {
  const config: FailureConfig = {
    poissonRate: 0.1,
    timeout: 100,
  };

  describe('timeout failures', () => {
    it('fails when duration exceeds timeout', () => {
      const result = checkFailure(101, 0, config);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('timeout');
    });

    it('fails when elapsed + duration exceeds timeout', () => {
      const result = checkFailure(50, 60, config);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('timeout');
    });

    it('does not fail when exactly at timeout', () => {
      // Random = 1 means we always survive Poisson
      const result = checkFailure(100, 0, config, () => 0);
      expect(result.failed).toBe(false);
    });
  });

  describe('poisson failures', () => {
    it('fails when random exceeds survival probability', () => {
      // For duration=10, λ=0.1: survival = e^(-1) ≈ 0.368
      // If random = 0.5 > 0.368, should fail
      const result = checkFailure(10, 0, config, () => 0.5);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('poisson');
    });

    it('succeeds when random is below survival probability', () => {
      // For duration=10, λ=0.1: survival = e^(-1) ≈ 0.368
      // If random = 0.1 < 0.368, should succeed
      const result = checkFailure(10, 0, config, () => 0.1);
      expect(result.failed).toBe(false);
    });

    it('always succeeds with zero duration', () => {
      // survival = e^0 = 1, so any random < 1 succeeds
      const result = checkFailure(0, 0, config, () => 0.999);
      expect(result.failed).toBe(false);
    });
  });

  describe('deterministic behavior with fixed random', () => {
    it('always succeeds with random = 0', () => {
      const result = checkFailure(10, 0, config, () => 0);
      expect(result.failed).toBe(false);
    });

    it('always fails poisson with random = 0.9999 (for non-zero duration)', () => {
      const result = checkFailure(10, 0, config, () => 0.9999);
      expect(result.failed).toBe(true);
      expect(result.reason).toBe('poisson');
    });
  });
});
