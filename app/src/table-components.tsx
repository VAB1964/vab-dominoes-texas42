import { Domino } from "./domino";
import type { Player } from "./types";

export function PlayerCard({
  p,
  pos,
  active,
}: {
  p: Pick<Player, "name" | "seat" | "score" | "tricks" | "isAI"> | undefined;
  pos: string;
  active: boolean;
}) {
  return (
    <div className={`player player-color-${p?.seat ?? 0} ${pos} ${active ? "active" : ""}`}>
      <span className="avatar">
        {p?.isAI ? "AI" : p?.name.slice(0, 2).toUpperCase()}
      </span>
      <div>
        <strong>{p?.name}</strong>
        <small>
          {p?.score} pts · {p?.tricks} tricks
        </small>
        {active && <small className="turn-indicator">Taking turn</small>}
      </div>
    </div>
  );
}

export function HiddenHand({
  count,
  pos,
  seat,
  active = false,
}: {
  count: number;
  pos: string;
  seat?: number;
  active?: boolean;
}) {
  return (
    <div className={`hidden-hand player-color-${seat ?? 0} ${pos} ${active ? "active" : ""}`}>
      {Array.from({ length: count }, (_, i) => (
        <Domino hidden key={i} />
      ))}
    </div>
  );
}
