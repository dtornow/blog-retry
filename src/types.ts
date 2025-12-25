/**
 * A Call represents an atomic unit of work with a specific duration.
 * It either completes fully or fails - there's no partial completion.
 */
export interface Call {
  readonly duration: number;
}

/**
 * A Program is a sequence of Calls to execute.
 */
export type Program = readonly Call[];

/**
 * Configuration for failure simulation.
 */
export interface FailureConfig {
  /** Poisson failure rate (lambda). Higher = more likely to fail per unit time. */
  readonly poissonRate: number;
  /** Hard timeout in time units. If exceeded, failure is certain. */
  readonly timeout: number;
}

/**
 * Result of a single execution attempt.
 */
export interface AttemptResult {
  /** Whether this attempt succeeded */
  readonly success: boolean;
  /** Time consumed in this attempt */
  readonly timeSpent: number;
  /** Index of the call that failed (if any) */
  readonly failedAtCallIndex?: number;
  /** Number of calls completed successfully in this attempt */
  readonly callsCompleted: number;
}

/**
 * Result of running a test (potentially multiple attempts with retries).
 */
export interface TestResult {
  /** Whether the test ultimately succeeded */
  readonly success: boolean;
  /** Total time spent across all attempts */
  readonly totalTime: number;
  /** Number of attempts made */
  readonly attempts: number;
  /** High watermark: furthest call index reached */
  readonly highWatermark: number;
}

/**
 * Aggregated results from running multiple tests.
 */
export interface SimulationResult {
  /** Total number of tests run */
  readonly testsRun: number;
  /** Number of successful tests */
  readonly successes: number;
  /** Success rate as a fraction */
  readonly successRate: number;
  /** Average total time across all tests */
  readonly avgTotalTime: number;
  /** Average number of attempts per test */
  readonly avgAttempts: number;
  /** Distribution of attempts (how many tests took N attempts) */
  readonly attemptDistribution: Map<number, number>;
}

/**
 * Execution mode for running programs.
 */
export type ExecutionMode = 'no-checkpoint' | 'with-checkpoint';
