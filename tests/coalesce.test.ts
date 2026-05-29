import { describe, it, expect } from "vitest";
import { serializeLatest } from "../src/util/coalesce";

describe("serializeLatest", () => {
  it("never overlaps, drops intermediates, always renders the last arg", async () => {
    const order: number[] = [];
    let active = 0;
    let maxActive = 0;
    const fn = async (n: number) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      order.push(n);
      active--;
    };
    const schedule = serializeLatest(fn);
    for (let i = 1; i <= 10; i++) schedule(i);   // fire 10 rapidly
    await new Promise((r) => setTimeout(r, 100)); // let the queue drain
    expect(maxActive).toBe(1);                    // (a) never concurrent
    expect(order.length).toBeLessThan(10);        // (b) coalesced
    expect(order[order.length - 1]).toBe(10);     // (c) last arg always runs
  });

  it("a rejected render does not wedge the queue", async () => {
    const seen: number[] = [];
    let first = true;
    const fn = async (n: number) => {
      if (first) { first = false; throw new Error("boom"); }
      seen.push(n);
    };
    const schedule = serializeLatest(fn);
    schedule(1);
    await new Promise((r) => setTimeout(r, 10));
    schedule(2);
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toContain(2); // queue still works after a throw
  });
});
