import type { Program, FailureConfig } from './types.js';
import { compareSimulations, formatComparison } from './simulation.js';
import { failureProbability } from './failure.js';

function runScenario(
  name: string,
  program: Program,
  config: FailureConfig,
  seed: number
): void {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log(`║  ${name.padEnd(56)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  const totalDuration = program.reduce((sum, call) => sum + call.duration, 0);
  console.log('PROGRAM CONFIGURATION');
  console.log('─────────────────────');
  console.log(`Number of calls:    ${program.length}`);
  console.log(`Duration per call:  ${program[0].duration} units`);
  console.log(`Total duration:     ${totalDuration} units`);
  console.log();

  console.log('FAILURE MODEL');
  console.log('─────────────');
  console.log(`Poisson rate (λ):   ${config.poissonRate} per unit`);
  console.log(`Timeout:            ${config.timeout} units`);
  console.log();

  const singleCallFailProb = failureProbability(
    program[0].duration,
    config.poissonRate
  );
  const fullProgramFailProb = failureProbability(
    totalDuration,
    config.poissonRate
  );
  console.log('THEORETICAL PROBABILITIES (Poisson only)');
  console.log('────────────────────────────────────────');
  console.log(
    `P(single call fails):      ${(singleCallFailProb * 100).toFixed(2)}%`
  );
  console.log(
    `P(full program fails):     ${(fullProgramFailProb * 100).toFixed(2)}%`
  );
  console.log();

  console.log('RUNNING SIMULATION (1000 tests each)...');
  console.log();

  const comparison = compareSimulations(program, config, 1000, 100, seed);
  console.log(formatComparison(comparison));
  console.log();
}

function main(): void {
  // Scenario 1: Poisson failures with comfortable timeout
  const program1: Program = Array(10).fill({ duration: 5 });
  const config1: FailureConfig = {
    poissonRate: 0.02,
    timeout: 100,
  };
  runScenario('SCENARIO 1: Transient Failures (Poisson)', program1, config1, 42);

  console.log('\n');

  // Scenario 2: Tight timeout - the dramatic case
  const program2: Program = Array(10).fill({ duration: 5 });
  const config2: FailureConfig = {
    poissonRate: 0,
    timeout: 40, // Total is 50, so without checkpoint it always fails!
  };
  runScenario('SCENARIO 2: Tight Timeout (No Poisson)', program2, config2, 42);

  console.log('\n');

  // Scenario 3: Both combined
  const program3: Program = Array(10).fill({ duration: 5 });
  const config3: FailureConfig = {
    poissonRate: 0.015,
    timeout: 40,
  };
  runScenario('SCENARIO 3: Poisson + Tight Timeout', program3, config3, 42);

  // Final insight
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('KEY INSIGHTS');
  console.log('─────────────');
  console.log('1. Transient failures: Checkpointing reduces wasted work.');
  console.log('   Retries resume from where we left off, saving time.');
  console.log();
  console.log('2. Timeout constraints: Checkpointing can mean the difference');
  console.log('   between IMPOSSIBLE and GUARANTEED success. If total work');
  console.log('   exceeds timeout but each step fits, checkpointing wins.');
  console.log();
  console.log('3. Combined effect: Real systems face both. Checkpointing');
  console.log('   dramatically improves success rate and efficiency.');
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
