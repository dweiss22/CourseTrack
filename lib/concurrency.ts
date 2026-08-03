/**
 * Runs `worker` over `items` with at most `limit` concurrent invocations.
 * Results are returned in the same order as `items`. A rejected worker call
 * propagates to the caller — callers that need partial-success semantics
 * (e.g. the Wrike sync) should catch inside `worker` and return a result
 * object instead of throwing.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
