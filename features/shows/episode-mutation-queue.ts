import type { EpisodeWatchedActionInput } from "@/features/tracking/action-validation";

import type { ShowProgressActionResult } from "./types";

export type EpisodeMutation = {
  episodeKey: string;
  input: EpisodeWatchedActionInput;
  previousWatched: boolean;
};

export class EpisodeMutationQueue {
  private active = false;
  private pendingKeys = new Set<string>();
  private queued: EpisodeMutation[] = [];

  constructor(
    private readonly execute: (input: EpisodeWatchedActionInput) => Promise<ShowProgressActionResult>,
    private readonly onSettled: (mutation: EpisodeMutation, result: ShowProgressActionResult) => void,
    private readonly onPendingChange: (keys: Set<string>) => void,
    private readonly onIdle: () => void,
  ) {}

  get hasPending() {
    return this.pendingKeys.size > 0;
  }

  isPending(episodeKey: string) {
    return this.pendingKeys.has(episodeKey);
  }

  enqueue(mutation: EpisodeMutation) {
    if (this.isPending(mutation.episodeKey)) {
      return false;
    }

    this.pendingKeys.add(mutation.episodeKey);
    this.queued.push(mutation);
    this.onPendingChange(new Set(this.pendingKeys));
    void this.drain();
    return true;
  }

  private async drain() {
    if (this.active) {
      return;
    }

    this.active = true;
    while (this.queued.length > 0) {
      const mutation = this.queued.shift();
      if (!mutation) {
        continue;
      }

      let result: ShowProgressActionResult;
      try {
        result = await this.execute(mutation.input);
      } catch {
        result = { message: "Unable to update progress right now.", status: "error" };
      }

      this.pendingKeys.delete(mutation.episodeKey);
      this.onSettled(mutation, result);
      this.onPendingChange(new Set(this.pendingKeys));
    }

    this.active = false;
    this.onIdle();
  }
}
