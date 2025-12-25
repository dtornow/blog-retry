# Retry Mechanics Simulation

A TypeScript simulation exploring how checkpointing affects retry behavior in the face of transient failures and timeouts.

## The Core Insight

The **same program**, doing the **same work**, can have dramatically different failure rates depending on execution strategy:

| Scenario | No Checkpoint | With Checkpoint |
|----------|---------------|-----------------|
| Transient failures | 100% success, 91 time units | 100% success, 55 time units |
| Tight timeout | **0% success** | **100% success** |

## Quick Start

```bash
npm install
npm run simulate
```

## Project Structure

```
src/
  types.ts        # Core types (Call, Program, FailureConfig)
  failure.ts      # Poisson + timeout failure logic
  executor.ts     # Execute with/without checkpointing
  simulation.ts   # Run N tests, collect stats
  main.ts         # Sample scenarios and comparison

blog/
  retry-mechanics.md  # Full writeup with analysis
```

## Running Tests

```bash
npm test
```

## The Model

- **Program**: A sequence of atomic `Call`s, each with a duration
- **Failure modes**:
  - Poisson process: Random failures with probability `1 - e^(-λt)`
  - Hard timeout: Failure is certain if duration exceeds limit
- **Checkpointing**: Resume from last completed call on retry

## Key Results

1. **Transient failures**: Checkpointing reduces wasted work by ~40%
2. **Timeout constraints**: Checkpointing can make the impossible possible
3. **Combined effect**: Real systems face both; checkpointing wins dramatically

Read the full analysis in [blog/retry-mechanics.md](blog/retry-mechanics.md).
