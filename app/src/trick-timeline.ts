export const TRICK_WINNER_DISPLAY_MS = 3000;
export const TRICK_COLLECT_ANIMATION_MS = 500;

export function scheduleTrickTimeline(
  onWinnerHoldComplete: () => void,
  onCollectComplete: () => void,
  winnerHoldMs = TRICK_WINNER_DISPLAY_MS,
  collectMs = TRICK_COLLECT_ANIMATION_MS,
) {
  let collectTimer: ReturnType<typeof setTimeout> | null = null;
  const winnerTimer = setTimeout(() => {
    onWinnerHoldComplete();
    collectTimer = setTimeout(() => {
      onCollectComplete();
      collectTimer = null;
    }, collectMs);
  }, winnerHoldMs);
  return () => {
    clearTimeout(winnerTimer);
    if (collectTimer) clearTimeout(collectTimer);
  };
}
