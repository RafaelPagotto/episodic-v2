import { describe, expect, it, vi } from "vitest";

import { EpisodeMutationQueue } from "../features/shows/episode-mutation-queue";
import type { ShowProgressActionResult } from "../features/shows/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function mutation(episodeNumber: number) {
  return {
    episodeKey: `1:${episodeNumber}`,
    input: { episodeNumber, seasonNumber: 1, tmdbId: 100, watched: true },
    previousWatched: false,
  };
}

const success: ShowProgressActionResult = { message: "Episode marked watched.", status: "success" };

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("single-episode mutation queue", () => {
  it("runs different episodes in click order with one request in flight and one idle refresh", async () => {
    const responses = [deferred<ShowProgressActionResult>(), deferred<ShowProgressActionResult>(), deferred<ShowProgressActionResult>()];
    const execute = vi.fn()
      .mockImplementationOnce(() => responses[0].promise)
      .mockImplementationOnce(() => responses[1].promise)
      .mockImplementationOnce(() => responses[2].promise);
    const onSettled = vi.fn();
    const onIdle = vi.fn();
    const queue = new EpisodeMutationQueue(execute, onSettled, vi.fn(), onIdle);

    expect(queue.enqueue(mutation(5))).toBe(true);
    expect(queue.enqueue(mutation(6))).toBe(true);
    expect(queue.enqueue(mutation(7))).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(queue.hasPending).toBe(true);
    expect(queue.enqueue(mutation(5))).toBe(false);

    responses[0].resolve(success);
    await flushPromises();
    expect(execute.mock.calls.map(([input]) => input.episodeNumber)).toEqual([5, 6]);
    expect(onIdle).not.toHaveBeenCalled();

    responses[1].resolve(success);
    await flushPromises();
    expect(execute.mock.calls.map(([input]) => input.episodeNumber)).toEqual([5, 6, 7]);

    responses[2].resolve(success);
    await flushPromises();
    expect(onSettled).toHaveBeenCalledTimes(3);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(queue.hasPending).toBe(false);
  });

  it("continues after an error and reports the failed episode separately", async () => {
    const first = deferred<ShowProgressActionResult>();
    const second = deferred<ShowProgressActionResult>();
    const execute = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const onSettled = vi.fn();
    const onIdle = vi.fn();
    const queue = new EpisodeMutationQueue(execute, onSettled, vi.fn(), onIdle);

    queue.enqueue(mutation(5));
    queue.enqueue(mutation(6));
    first.resolve({ message: "Episode rejected.", status: "error" });
    await flushPromises();
    expect(onSettled).toHaveBeenNthCalledWith(1, mutation(5), { message: "Episode rejected.", status: "error" });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(queue.isPending("1:5")).toBe(false);
    expect(queue.isPending("1:6")).toBe(true);

    second.resolve(success);
    await flushPromises();
    expect(onSettled).toHaveBeenNthCalledWith(2, mutation(6), success);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
