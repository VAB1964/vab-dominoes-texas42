import { describe, expect, it, vi } from "vitest";
import {
  scheduleTrickTimeline,
  TRICK_COLLECT_ANIMATION_MS,
  TRICK_WINNER_DISPLAY_MS,
} from "./trick-timeline";

describe("trick timeline", () => {
  it("holds winner then collects with configured timing", () => {
    vi.useFakeTimers();
    const winnerSpy = vi.fn();
    const collectSpy = vi.fn();
    scheduleTrickTimeline(winnerSpy, collectSpy);

    vi.advanceTimersByTime(TRICK_WINNER_DISPLAY_MS - 1);
    expect(winnerSpy).toHaveBeenCalledTimes(0);
    expect(collectSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(1);
    expect(winnerSpy).toHaveBeenCalledTimes(1);
    expect(collectSpy).toHaveBeenCalledTimes(0);

    vi.advanceTimersByTime(TRICK_COLLECT_ANIMATION_MS - 1);
    expect(collectSpy).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(collectSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("supports cancellation before completion", () => {
    vi.useFakeTimers();
    const winnerSpy = vi.fn();
    const collectSpy = vi.fn();
    const cancel = scheduleTrickTimeline(winnerSpy, collectSpy);
    cancel();
    vi.runAllTimers();
    expect(winnerSpy).not.toHaveBeenCalled();
    expect(collectSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
