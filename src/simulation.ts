import type {
  Program,
  FailureConfig,
  ExecutionMode,
  SimulationResult,
  TestResult,
} from './types.js';
import { runTest } from './executor.js';

/**
 * Creates a seeded random number generator for reproducible results.
 * Uses a simple linear congruential generator (LCG).
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    // LCG parameters (same as glibc)
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Runs a simulation with N tests and aggregates results.
 *
 * @param program - The program to execute
 * @param config - Failure configuration
 * @param mode - Execution mode
 * @param numTests - Number of tests to run
 * @param maxAttempts - Maximum attempts per test
 * @param seed - Optional seed for reproducibility
 */
export function runSimulation(
  program: Program,
  config: FailureConfig,
  mode: ExecutionMode,
  numTests: number = 1000,
  maxAttempts: number = 100,
  seed?: number
): SimulationResult {
  const random = seed !== undefined ? createSeededRandom(seed) : Math.random;

  const results: TestResult[] = [];
  let successes = 0;
  let totalTime = 0;
  let totalAttempts = 0;
  const attemptDistribution = new Map<number, number>();

  for (let i = 0; i < numTests; i++) {
    const result = runTest(program, config, mode, maxAttempts, random);
    results.push(result);

    if (result.success) {
      successes++;
    }
    totalTime += result.totalTime;
    totalAttempts += result.attempts;

    // Update attempt distribution
    const count = attemptDistribution.get(result.attempts) ?? 0;
    attemptDistribution.set(result.attempts, count + 1);
  }

  return {
    testsRun: numTests,
    successes,
    successRate: successes / numTests,
    avgTotalTime: totalTime / numTests,
    avgAttempts: totalAttempts / numTests,
    attemptDistribution,
  };
}

/**
 * Compares two execution modes side by side.
 */
export function compareSimulations(
  program: Program,
  config: FailureConfig,
  numTests: number = 1000,
  maxAttempts: number = 100,
  seed?: number
): { noCheckpoint: SimulationResult; withCheckpoint: SimulationResult } {
  // Use the same seed for both to ensure fair comparison
  const noCheckpoint = runSimulation(
    program,
    config,
    'no-checkpoint',
    numTests,
    maxAttempts,
    seed
  );

  const withCheckpoint = runSimulation(
    program,
    config,
    'with-checkpoint',
    numTests,
    maxAttempts,
    seed
  );

  return { noCheckpoint, withCheckpoint };
}

/**
 * Formats a simulation result for display.
 */
export function formatResult(
  result: SimulationResult,
  mode: ExecutionMode
): string {
  const lines = [
    `=== ${mode.toUpperCase()} ===`,
    `Tests run:     ${result.testsRun}`,
    `Successes:     ${result.successes}`,
    `Success rate:  ${(result.successRate * 100).toFixed(2)}%`,
    `Avg time:      ${result.avgTotalTime.toFixed(2)} units`,
    `Avg attempts:  ${result.avgAttempts.toFixed(2)}`,
  ];

  // Show attempt distribution (top 5)
  const sorted = [...result.attemptDistribution.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  const top5 = sorted.slice(0, 5);
  if (top5.length > 0) {
    lines.push('Attempt distribution (top 5):');
    for (const [attempts, count] of top5) {
      const pct = ((count / result.testsRun) * 100).toFixed(1);
      lines.push(`  ${attempts} attempts: ${count} tests (${pct}%)`);
    }
  }

  return lines.join('\n');
}

/**
 * Formats a comparison of two simulation results.
 */
export function formatComparison(comparison: {
  noCheckpoint: SimulationResult;
  withCheckpoint: SimulationResult;
}): string {
  const nc = comparison.noCheckpoint;
  const wc = comparison.withCheckpoint;

  const successDiff = wc.successRate - nc.successRate;
  const timeDiff = nc.avgTotalTime - wc.avgTotalTime;
  const attemptDiff = nc.avgAttempts - wc.avgAttempts;

  const lines = [
    formatResult(nc, 'no-checkpoint'),
    '',
    formatResult(wc, 'with-checkpoint'),
    '',
    '=== COMPARISON ===',
    `Success rate improvement: ${successDiff >= 0 ? '+' : ''}${(successDiff * 100).toFixed(2)}%`,
    `Time saved:               ${timeDiff >= 0 ? '' : '-'}${Math.abs(timeDiff).toFixed(2)} units (${((timeDiff / nc.avgTotalTime) * 100).toFixed(1)}%)`,
    `Attempts saved:           ${attemptDiff >= 0 ? '' : '-'}${Math.abs(attemptDiff).toFixed(2)} (${((attemptDiff / nc.avgAttempts) * 100).toFixed(1)}%)`,
  ];

  return lines.join('\n');
}
