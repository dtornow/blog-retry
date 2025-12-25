import type {
  Program,
  FailureConfig,
  AttemptResult,
  TestResult,
  ExecutionMode,
} from './types.js';
import { checkFailure } from './failure.js';

/**
 * Executes a single attempt of a program starting from a given index.
 *
 * @param program - The program to execute
 * @param startIndex - Index to start from (for checkpoint resume)
 * @param config - Failure configuration
 * @param mode - Execution mode (affects timeout calculation)
 * @param random - Random number generator
 */
export function executeAttempt(
  program: Program,
  startIndex: number,
  config: FailureConfig,
  mode: ExecutionMode,
  random: () => number = Math.random
): AttemptResult {
  let timeSpent = 0;
  let callsCompleted = startIndex; // Already completed calls (skipped)

  for (let i = startIndex; i < program.length; i++) {
    const call = program[i];

    // For no-checkpoint mode, elapsed time accumulates across the entire attempt
    // For checkpoint mode, each call starts fresh (elapsedTime = 0)
    const elapsedTime = mode === 'no-checkpoint' ? timeSpent : 0;

    const result = checkFailure(call.duration, elapsedTime, config, random);

    if (result.failed) {
      // Call failed - add partial time (we assume failure happens at some point during the call)
      // For simplicity, we charge the full duration even on failure
      timeSpent += call.duration;
      return {
        success: false,
        timeSpent,
        failedAtCallIndex: i,
        callsCompleted,
      };
    }

    // Call succeeded
    timeSpent += call.duration;
    callsCompleted = i + 1;
  }

  // All calls completed successfully
  return {
    success: true,
    timeSpent,
    callsCompleted,
  };
}

/**
 * Runs a complete test with retries until success or max attempts reached.
 *
 * @param program - The program to execute
 * @param config - Failure configuration
 * @param mode - Execution mode
 * @param maxAttempts - Maximum number of retry attempts
 * @param random - Random number generator
 */
export function runTest(
  program: Program,
  config: FailureConfig,
  mode: ExecutionMode,
  maxAttempts: number = 100,
  random: () => number = Math.random
): TestResult {
  let totalTime = 0;
  let attempts = 0;
  let highWatermark = 0;

  while (attempts < maxAttempts) {
    attempts++;

    // Determine where to start based on mode and high watermark
    const startIndex = mode === 'with-checkpoint' ? highWatermark : 0;

    const result = executeAttempt(program, startIndex, config, mode, random);
    totalTime += result.timeSpent;

    // Update high watermark (furthest we've ever gotten)
    if (result.callsCompleted > highWatermark) {
      highWatermark = result.callsCompleted;
    }

    if (result.success) {
      return {
        success: true,
        totalTime,
        attempts,
        highWatermark,
      };
    }
  }

  // Exceeded max attempts
  return {
    success: false,
    totalTime,
    attempts,
    highWatermark,
  };
}
