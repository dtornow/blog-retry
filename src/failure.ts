import type { FailureConfig } from './types.js';

/**
 * Determines if a call fails based on Poisson process and timeout.
 *
 * Failure can occur for two reasons:
 * 1. Poisson failure: Random failure with probability 1 - e^(-λt)
 * 2. Timeout: If duration exceeds timeout, failure is certain
 *
 * @param duration - Duration of the call
 * @param elapsedTime - Time already elapsed (for non-checkpointed mode)
 * @param config - Failure configuration
 * @param random - Random number generator (0-1), defaults to Math.random
 * @returns Object with failure status and reason
 */
export function checkFailure(
  duration: number,
  elapsedTime: number,
  config: FailureConfig,
  random: () => number = Math.random
): { failed: boolean; reason?: 'timeout' | 'poisson' } {
  const totalTime = elapsedTime + duration;

  // Check timeout first - this is deterministic
  if (totalTime > config.timeout) {
    return { failed: true, reason: 'timeout' };
  }

  // Check Poisson failure - probabilistic
  // P(failure) = 1 - e^(-λt) over the duration of this call
  const survivalProbability = Math.exp(-config.poissonRate * duration);
  const randomValue = random();

  if (randomValue > survivalProbability) {
    return { failed: true, reason: 'poisson' };
  }

  return { failed: false };
}

/**
 * Calculates the probability of surviving (not failing) for a given duration.
 * Uses the Poisson process: P(survive) = e^(-λt)
 */
export function survivalProbability(
  duration: number,
  poissonRate: number
): number {
  return Math.exp(-poissonRate * duration);
}

/**
 * Calculates the probability of failure for a given duration.
 * P(failure) = 1 - e^(-λt)
 */
export function failureProbability(
  duration: number,
  poissonRate: number
): number {
  return 1 - survivalProbability(duration, poissonRate);
}
