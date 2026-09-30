import type {
  ContinueWatchingWatchedActionInput,
  ContinueWatchingWatchedActionResult,
} from "./actions";

export type ContinueWatchingMutation = {
  input: ContinueWatchingWatchedActionInput;
  showId: number;
};

export class ContinueWatchingMutationQueue {
  private active = false;
  private pendingShowIds = new Set<number>();
  private queued: ContinueWatchingMutation[] = [];

  constructor(
    private readonly execute: (input: ContinueWatchingWatchedActionInput) => Promise<ContinueWatchingWatchedActionResult>,
    private readonly onSettled: (mutation: ContinueWatchingMutation, result: ContinueWatchingWatchedActionResult) => void,
    private readonly onIdle: () => void,
  ) {}

  get hasPending() {
    return this.pendingShowIds.size > 0;
  }

  isPending(showId: number) {
    return this.pendingShowIds.has(showId);
  }

  enqueue(mutation: ContinueWatchingMutation) {
    if (this.isPending(mutation.showId)) return false;

    this.pendingShowIds.add(mutation.showId);
    this.queued.push(mutation);
    void this.drain();
    return true;
  }

  private async drain() {
    if (this.active) return;

    this.active = true;
    while (this.queued.length > 0) {
      const mutation = this.queued.shift();
      if (!mutation) continue;

      let result: ContinueWatchingWatchedActionResult;
      try {
        result = await this.execute(mutation.input);
      } catch {
        result = { message: "Unable to update this episode right now.", status: "error" };
      }

      this.pendingShowIds.delete(mutation.showId);
      this.onSettled(mutation, result);
    }

    this.active = false;
    this.onIdle();
  }
}
