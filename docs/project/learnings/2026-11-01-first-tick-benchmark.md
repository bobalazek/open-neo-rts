# First headless tick measurements

On 2026-11-01, `bun neo bench --units 1000 --ticks 1000` on an Apple M1 Max, 32 GiB RAM, macOS 27.0.1 (26A434), Bun 1.3.9 (cf6cdbbb), reported **mean 0.216 ms, p95 0.304 ms, max 2.093 ms per tick**. All three were below the [12 ms starting budget](../../engineering/architecture.md#8-server-and-replication), with the mean using about 1.8% of it. This is the phase-1a flat-world movement workload, not evidence that a full match meets the budget: combat, pathfinding, visibility and networking are absent.

The workload used seed 1 and 1,000 content-defined Collective Soldiers, evenly distributed over eight Eastern Collective Forces. Spawning was excluded; 100 ticks warmed the moving simulation before 1,000 measured `step` calls. Destinations alternate every 100 ticks, keeping units moving without arriving. Command construction and result validation are outside the timer; command dispatch, movement and the kernel's automatic checkpoint serialization/hashing every 100 ticks are included. These are one local run's measurements under ordinary desktop load, with no CI timing threshold.

The same invocation reported the following **total milliseconds for one batch of 1,000 entities**, using one `i32` component:

| Operation | ECS ms | Sparse-set ms |
| --------- | ------ | ------------- |
| create    | 0.224  | 0.068         |
| add       | 0.167  | 0.197         |
| query     | 0.040  | 0.009         |
| iterate   | 0.166  | 0.116         |

Both stores create ascending IDs, attach `x = id`, copy matching IDs for the query and sum the same values while iterating; counts and checksums are asserted. Initial store registration/allocation is excluded, while later growth is included. The sparse set is a preallocated single-component baseline, without the ECS's validation, arbitrary components, serialization or slot recycling. The batches run once, ECS first, without a separate microbenchmark warmup: their tiny durations are noisy and do not justify an ECS rewrite. Rerun with a larger entity count and repeated invocations before drawing optimization conclusions.
