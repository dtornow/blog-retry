# The Mechanics of Retry: Why Breaking Work Into Chunks Changes Everything

Computations crash. This isn't pessimism—it's physics. Memory corrupts. Networks partition. Processes get killed. And the longer your computation runs, the more opportunities the universe has to intervene.

But here's what's interesting: the *same* program, doing the *same* work, can have dramatically different failure rates depending on how you execute it. This post explores why, with a TypeScript simulation you can run yourself.

## One Process, Constant Danger

Let's start with a simple model. You have a process—a serverless function, a container, a connection. It's running. At every moment, there's some probability it crashes:

- A cosmic ray flips a bit
- The network hiccups
- The OOM killer strikes
- A dependency times out

We model this as a **Poisson process** with rate λ. At any instant, there's a constant hazard rate. The probability of surviving for duration *t* is:

```
P(survive t) = e^(-λt)
```

The longer you run, the more you're exposed to danger. More exposure, more chances for something to go wrong.

## The Failure Model

Our simulation uses two failure mechanisms:

**1. Poisson failures (random crashes)**

The process can fail at any moment. For a time interval of duration *d*, the probability of failure is:

```
P(fail during interval d) = 1 - e^(-λd)
```

This is memoryless—the process doesn't "remember" how long it's been running. Each instant has the same hazard rate. But crucially, **more time means more exposure**, and more exposure means higher cumulative probability of at least one failure.

**2. Hard timeout**

Many systems have a hard cutoff. Serverless functions have execution limits. HTTP requests time out. At time *T*, your process is killed—no exceptions. This isn't probabilistic; it's certain.

## Calls Are Atomic

Now let's add structure. Your work consists of a sequence of **calls**—discrete units of work:

```typescript
type Program = readonly Call[];

interface Call {
  readonly duration: number;
}
```

Each call is **atomic**: it either completes fully or fails entirely. You cannot checkpoint mid-call. If a failure happens during Call 3, that call's work is lost.

```
|-- Call 1 --|-- Call 2 --|-- Call 3 --|-- Call 4 --|
0            5            10           15           20
             ↑            ↑            ↑            ↑
         checkpoint    checkpoint    checkpoint   checkpoint

If failure at t=12: Calls 1-2 saved, Call 3 lost, resume from Call 3
```

This has important implications:
- **Longer calls = more risk** before the next checkpoint
- **If any single call exceeds the timeout, the program is impossible** to complete
- Checkpoint granularity is determined by call boundaries

## Two Execution Modes

Given this model, consider two ways to run the same program:

**Without checkpointing:**
- On failure, restart from the beginning
- Timeout applies to total elapsed time
- Each retry redoes all previous work

**With checkpointing:**
- On failure, resume from the last completed call
- Timeout resets after each call
- Retries only redo the failed call

The key insight: **checkpointing reduces total exposure time**.

```
Without checkpoint:
  Attempt 1: 15 units, crash (calls 1-3 lost)
  Attempt 2: 20 units, crash (calls 1-4 lost)
  Attempt 3: 50 units, success
  Total exposure: 85 units

With checkpoint:
  Attempt 1: 15 units, crash (calls 1-2 saved, call 3 lost)
  Attempt 2: 35 units, success (only calls 3-10 needed)
  Total exposure: 50 units
```

Less total time running = less exposure to failure = fewer crashes along the way.

## The Markov Chain Perspective

Both execution modes form a **Markov chain**. The state is how many calls we've completed. The next state depends only on the current state, not on history.

**With checkpointing** — a ratchet that only moves forward:
```
State: 0 → 1 → 2 → 3 → ... → n (success)
       ↺   ↺   ↺   ↺
     retry retry retry
     (stay) (stay) (stay)
```
Failure at state *i* → stay at *i*, retry that call.

**Without checkpointing** — any failure resets to zero:
```
State: 0 → 1 → 2 → 3 → ... → n (success)
       ↖___↙ ↖__↙ ↖__↙
         reset  reset  reset
```
Failure at *any* state → back to 0.

Both are Markov chains. The difference is the transition structure. The ratchet version reaches the absorbing state (success) much faster on average.

## Why Memorylessness Matters

The Poisson process is memoryless:

```
P(survive next t | already survived s) = P(survive t)
```

The process doesn't accumulate fatigue. Each moment is independent. This is why checkpointing is mathematically valid—we're not "cheating" by resetting the clock after each call. There's no hidden state we're ignoring.

But even with memorylessness, **total exposure time still matters**. The probability of *at least one* failure over time *T* increases with *T*. Checkpointing doesn't change the hazard rate, but it reduces how much total time you need to finish the work.

Think of it this way: if you need to cross a minefield, the memoryless model says each step has the same risk. But fewer total steps = fewer chances to hit a mine.

## The Simulation

We test this with 1,000 simulated runs per mode. The program is 10 calls, each taking 5 time units (50 total). We measure success rate, average time to completion, and number of attempts.

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

The executor tracks progress and resumes appropriately:

```typescript
function runTest(program, config, mode, maxAttempts): TestResult {
  let highWatermark = 0;  // Furthest call completed (our checkpoint)

  while (attempts < maxAttempts) {
    // With checkpoint: resume from highWatermark
    // Without: always start from 0
    const startIndex = mode === 'with-checkpoint' ? highWatermark : 0;

    const result = executeAttempt(program, startIndex, config, mode);

    // Update checkpoint on progress
    if (result.callsCompleted > highWatermark) {
      highWatermark = result.callsCompleted;
    }

    if (result.success) return success;
  }

  return failure;
}
```

## The Results

### Scenario 1: Transient Failures Only

**Setup:** 10 calls × 5 units = 50 total. Poisson rate λ=0.02. Generous timeout (100 units).

| Metric | No Checkpoint | With Checkpoint |
|--------|---------------|-----------------|
| Success Rate | 100% | 100% |
| Avg Total Time | 91.02 units | 55.30 units |
| Avg Attempts | 2.76 | 2.06 |

Both eventually succeed. But checkpointing is **39% faster**. Less time redoing work = less total exposure.

### Scenario 2: Tight Timeout

**Setup:** Same program (50 units total). Timeout of 40 units. No Poisson failures.

| Metric | No Checkpoint | With Checkpoint |
|--------|---------------|-----------------|
| Success Rate | **0%** | **100%** |
| Avg Total Time | 4,500 units | 50 units |
| Avg Attempts | 100 (max) | 1 |

Without checkpointing, this program is **impossible**. Total duration (50) exceeds timeout (40). Every attempt fails at the same point.

With checkpointing, each 5-unit call easily fits within the 40-unit timeout. The program completes on the first attempt, every time.

**Same program. Same work. 0% vs 100% success rate.**

### Scenario 3: Combined

**Setup:** Poisson rate λ=0.015 + timeout of 40 units.

| Metric | No Checkpoint | With Checkpoint |
|--------|---------------|-----------------|
| Success Rate | **0%** | **100%** |
| Avg Total Time | 3,392 units | 54 units |
| Avg Attempts | 100 (max) | 1.80 |

Real systems face both failure modes. The timeout makes non-checkpointed execution impossible. Checkpointing handles both gracefully.

## The Design Principle

This leads to a concrete principle:

> **Decompose work into atomic steps that individually fit within your system's constraints.**

Not because it's elegant. Because the math demands it:

1. **Each step must fit within the timeout.** If any single call exceeds the limit, no amount of retrying helps.

2. **Smaller steps = more frequent checkpoints = less work lost on failure.** The ratchet advances more often.

3. **Less total time to completion = less exposure to failure.** Even with memoryless failures, fewer total time units means fewer chances to crash.

## Running It Yourself

```bash
git clone <repo>
cd retry-mechanics
npm install
npm run simulate
```

Experiment with the parameters:
- More calls with shorter duration vs fewer calls with longer duration
- Tighter timeouts
- Higher failure rates

The patterns hold. Checkpointing wins, and it wins bigger as conditions get harder.

## Conclusion

Retry is a bet that failure was transient. Checkpointing improves the odds:

1. **Less wasted work** — failed retries don't discard completed calls
2. **Fresh timeout budget** — each call gets the full limit
3. **Less total exposure** — faster completion = fewer chances to crash

The simulation makes this visceral. Same program, same work, but execution strategy alone determines whether success is impossible (0%) or guaranteed (100%).

The lesson: the *structure* of how you execute matters as much as *what* you execute. One process, constant danger, but checkpoints let you bank your progress and minimize your time in the minefield.

---

*Full source code in TypeScript. Run the simulation, read the tests, modify the scenarios. See the math play out.*
