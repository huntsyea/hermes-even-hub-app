// Latest-wins serializer: while a call is in flight, keep only the newest
// pending argument; never run `fn` concurrently. Errors are swallowed so a
// failed render never wedges the queue.
export function serializeLatest<T>(fn: (arg: T) => Promise<void>): (arg: T) => void {
  let running = false;
  let pending: { arg: T } | null = null;
  return (arg: T) => {
    pending = { arg };
    if (running) return;
    running = true;
    queueMicrotask(async function flush() {
      while (pending) {
        const next = pending;
        pending = null;
        try {
          await fn(next.arg);
        } catch {
          /* swallow; never wedge the loop */
        }
      }
      running = false;
    });
  };
}
