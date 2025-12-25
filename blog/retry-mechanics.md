# The Mechanics of Retry: Why Breaking Work Into Chunks Changes Everything

Computations crash. This isn't pessimism—it's physics. Memory corrupts. Networks partition. Processes get killed. And the longer your computation runs, the more opportunities the universe has to intervene.

But here's what's interesting: the *same* program, doing the *same* work, can have dramatically different failure rates depending on how you execute it. This post explores why, with a TypeScript simulation you can run yourself.

## The Inevitability of Failure

Consider a simple model: your computation has some probability of crashing per unit of time. This follows a Poisson process—random failures occur at a constant average rate. The probability of surviving for duration *t* is:

```
P(survive) = e^(-λt)
```

Where λ is the failure rate. The longer you run, the lower your survival probability.

But there's a harder constraint lurking in most systems: **timeouts**. Serverless functions have execution limits. HTTP requests time out. Kubernetes kills pods that run too long. At some point *t = T*, your survival probability doesn't just decrease—it drops to zero.

This creates an uncomfortable reality: some computations are *structurally impossible* to complete, not because they're too complex, but because they take too long.

## The Checkpointing Insight

What if we could reset the clock?

Imagine breaking your computation into discrete steps—let's call them "calls." Each call is atomic: it either completes fully or fails entirely. If we treat each completed call as a checkpoint, we can:

1. **Reset the timeout clock** after each call
2. **Resume from the last checkpoint** on retry, rather than starting over

Same total work. Different execution semantics. But does it actually matter?

Let's find out.

## Building the Simulation

We'll model a program as a sequence of calls, each with a duration:

```typescript
interface Call {
  readonly duration: number;
}

type Program = readonly Call[];
```

And a failure configuration with both Poisson failures and hard timeouts:

```typescript
interface FailureConfig {
  readonly poissonRate: number;  // λ: failure rate per time unit
  readonly timeout: number;       // Hard cutoff
}
```

The failure check combines both mechanisms:

```typescript
function checkFailure(
  duration: number,
  elapsedTime: number,
  config: FailureConfig
): { failed: boolean; reason?: 'timeout' | 'poisson' } {
  const totalTime = elapsedTime + duration;

  // Timeout is deterministic
  if (totalTime > config.timeout) {
    return { failed: true, reason: 'timeout' };
  }

  // Poisson failure is probabilistic
  const survivalProbability = Math.exp(-config.poissonRate * duration);
  if (Math.random() > survivalProbability) {
    return { failed: true, reason: 'poisson' };
  }

  return { failed: false };
}
```

## Two Execution Modes

The key insight is in how we handle `elapsedTime`:

**Without checkpointing:** Time accumulates across the entire program. If calls take 5+5+5+5... units, the tenth call sees `elapsedTime = 45`. If that plus its duration exceeds the timeout, it fails—every time.

**With checkpointing:** Each call starts fresh. `elapsedTime = 0` for every call. The timeout applies to each call individually, not the sum.

On retry, the difference compounds:

```typescript
function runTest(
  program: Program,
  config: FailureConfig,
  mode: ExecutionMode,
  maxAttempts: number
): TestResult {
  let highWatermark = 0;  // Furthest call completed

  while (attempts < maxAttempts) {
    // Without checkpoint: always start from 0
    // With checkpoint: resume from highWatermark
    const startIndex = mode === 'with-checkpoint' ? highWatermark : 0;

    const result = executeAttempt(program, startIndex, config, mode);

    if (result.callsCompleted > highWatermark) {
      highWatermark = result.callsCompleted;
    }

    if (result.success) return { success: true, ... };
  }

  return { success: false, ... };
}
```

## The Results

We ran 1,000 simulated tests for each mode across three scenarios. The results are striking.

### Scenario 1: Transient Failures Only

**Setup:** 10 calls × 5 time units each. Poisson rate λ=0.02. Generous timeout of 100 units.

| Metric | No Checkpoint | With Checkpoint |
|--------|---------------|-----------------|
| Success Rate | 100% | 100% |
| Avg Time | 91.02 units | 55.30 units |
| Avg Attempts | 2.76 | 2.06 |

Both eventually succeed, but checkpointing is **39% faster**. When a failure occurs, we don't throw away completed work.

### Scenario 2: Tight Timeout (The Dramatic Case)

**Setup:** 10 calls × 5 time units = 50 total. Timeout of 40 units. No Poisson failures.

| Metric | No Checkpoint | With Checkpoint |
|--------|---------------|-----------------|
| Success Rate | **0%** | **100%** |
| Avg Time | 4,500 units | 50 units |
| Avg Attempts | 100 (max) | 1 |

Without checkpointing, this program is *impossible* to complete. The total duration (50) exceeds the timeout (40). Every attempt fails at the same point. Retry is futile.

With checkpointing, each 5-unit call fits comfortably within the 40-unit timeout. The program completes on the first attempt, every time.

**Same program. Same work. 0% vs 100% success rate.**

### Scenario 3: Combined (Real-World)

**Setup:** 10 calls × 5 units. Poisson rate λ=0.015. Timeout of 40 units.

| Metric | No Checkpoint | With Checkpoint |
|--------|---------------|-----------------|
| Success Rate | **0%** | **100%** |
| Avg Time | 3,392 units | 54 units |
| Avg Attempts | 100 (max) | 1.80 |

Real systems face both failure modes. The combined effect is devastating without checkpointing—and trivially handled with it.

## The Deeper Insight

This isn't just about retry mechanics. It's about the *structure* of computation.

When you write a long-running function, you're implicitly making a bet: "The universe will leave me alone long enough to finish." The longer your function, the worse that bet becomes.

Checkpointing changes the bet. Instead of wagering on surviving the entire duration, you're wagering on surviving each step. And crucially, you get to keep your winnings between steps.

But there's a catch: **calls must be atomic**. If a single call exceeds the timeout, no amount of checkpointing saves you. The unit of work must fit within the constraint.

This leads to a design principle:

> Decompose work into steps that are individually completable within your system's constraints.

Not because it's elegant. Because the math demands it.

## Running the Simulation Yourself

Clone the repository and run:

```bash
npm install
npm run simulate
```

You'll see all three scenarios with full statistics. The code is designed to be readable—explore `src/executor.ts` to see the checkpoint logic, and `src/failure.ts` for the probability model.

Try modifying the scenarios:
- What happens with more calls?
- With tighter timeouts?
- With higher failure rates?

The patterns hold. Checkpointing wins, and it wins bigger as conditions get harder.

## Conclusion

Retry is not magic. It's a bet that failure was transient, not structural. Checkpointing improves the odds of that bet by:

1. **Preserving progress:** Failed retries don't discard completed work
2. **Resetting constraints:** Each step gets a fresh timeout budget
3. **Enabling completion:** Work that exceeds global limits becomes possible when chunked

The simulation makes this visceral: same program, same work, but 0% success without checkpointing versus 100% with it.

The lesson isn't "always use checkpointing." It's that the *structure* of how you execute matters as much as *what* you execute. Understanding failure mechanics lets you design systems that don't just retry—they retry intelligently.

---

*The full simulation code is available in TypeScript. Each component is tested and designed to be extended. Try it, break it, and see what else you can learn about the mechanics of retry.*
