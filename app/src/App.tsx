import { useEffect, useMemo, useRef, useState } from "react";
import { RoomClient } from "./client";
import { Domino } from "./domino";
import type { Domino as D, GameType, RoomView, Rules, Trump } from "./types";
const codeFromUrl = () =>
  location.pathname.match(/\/room\/([A-HJ-NP-Z2-9]{6})/i)?.[1]?.toUpperCase() ||
  "";
const defaults: Rules = {
  minimumBid: 4,
  allPass: "redeal",
  declareTrumpBeforeWidow: false,
  widow: "exchange",
  moonScoring: "points",
  allowDoublesTrump: true,
  allowFollowMe: true,
  overcallMoon: false,
  targetScore: 21,
};
const TRICK_CLEAR_DELAY_MS = 2200;
const TRICK_CLEAR_DELAY_AI_LAST_MS = 3200;
const BUTTON_CLICK_VOLUME = 0.03;
type DisplayedTrickPlay = RoomView["game"]["trick"][number] & { id: number };
async function safeJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
export default function App() {
  const invite = useMemo(codeFromUrl, []);
  const [screen, setScreen] = useState<"home" | "room" | "game">(
    invite ? "room" : "home",
  );
  const [name, setName] = useState(
    localStorage.getItem("moon.name") || "Vince",
  );
  const [gameType, setGameType] = useState<GameType>("moon");
  const [code, setCode] = useState(invite);
  const [joinCode, setJoinCode] = useState(invite);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const client = useRef<RoomClient | null>(null);
  const clickAudioContext = useRef<AudioContext | null>(null);

  useEffect(() => {
    const playClick = () => {
      if (typeof window === "undefined" || !("AudioContext" in window)) return;
      try {
        const Ctx = window.AudioContext;
        const ctx = clickAudioContext.current || new Ctx();
        clickAudioContext.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(720, ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          BUTTON_CLICK_VOLUME,
          ctx.currentTime + 0.006,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.055);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start();
        oscillator.stop(ctx.currentTime + 0.06);
      } catch {
        // Ignore audio playback errors so button behavior is never blocked.
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!button || (button as HTMLButtonElement).disabled) return;
      playClick();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      const ctx = clickAudioContext.current;
      clickAudioContext.current = null;
      if (ctx) void ctx.close();
    };
  }, []);
  const enter = (room: string, create: boolean, type: GameType = gameType) => {
    localStorage.setItem("moon.name", name.trim());
    setCode(room);
    setScreen("room");
    const c = new RoomClient(room, (next, err) => {
      if (err) setError(err);
      if (next) {
        setError("");
        setView(next);
        if (next.game.phase !== "lobby") setScreen("game");
      }
    });
    client.current = c;
    c.connect(name.trim(), create, type);
  };
  useEffect(() => () => client.current?.close(), []);
  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const r = await fetch("/api/dominoes/rooms", { method: "POST" });
      const b = await safeJson<{ roomId?: string; error?: { message?: string } }>(
        r,
      );
      if (!r.ok) {
        throw new Error(b?.error?.message || "Room service unavailable.");
      }
      if (!b?.roomId) throw new Error("Room service unavailable.");
      enter(b.roomId, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create room.");
    } finally {
      setCreating(false);
    }
  };
  if (screen === "game" && view)
    return (
      <Game
        view={view}
        playerId={client.current?.playerId || ""}
        error={error}
        send={(t, p) => client.current?.send(t, p)}
        leave={() => {
          client.current?.close();
          setScreen("home");
          setView(null);
        }}
      />
    );
  if (screen === "room" && view)
    return (
      <Lobby
        view={view}
        playerId={client.current?.playerId || ""}
        send={(t, p) => client.current?.send(t, p)}
        leave={() => {
          client.current?.close();
          setScreen("home");
          setView(null);
        }}
      />
    );
  return (
    <main className="entry-shell">
      <section className="entry-card">
        <span className="eyebrow">VAB Games presents</span>
        <h1>Domino Card Room</h1>
        <p>
          Choose three-player Moon or four-player partnership Texas 42. Invite
          friends or fill open chairs with AI players.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="game-picks">
          <button
            className={gameType === "moon" ? "selected" : ""}
            onClick={() => setGameType("moon")}
          >
            <strong>Moon</strong>
            <span>3 players · individual scoring · widow</span>
          </button>
          <button
            className={gameType === "texas42" ? "selected" : ""}
            onClick={() => setGameType("texas42")}
          >
            <strong>Texas 42</strong>
            <span>4 players · partners · count dominoes</span>
          </button>
        </div>
        <label>
          Your name
          <input
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={!name.trim() || creating}
          onClick={() => void create()}
        >
          {creating
            ? "Creating…"
            : `Create ${gameType === "moon" ? "Moon" : "Texas 42"} game`}
        </button>
        <div className="or">or</div>
        <label>
          Room code
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC234"
          />
        </label>
        <button
          disabled={!name.trim() || !/[A-HJ-NP-Z2-9]{6}/.test(joinCode)}
          onClick={() => enter(joinCode, false)}
        >
          Join game
        </button>
        <a href="https://vabgames.com">Back to VABGames.com</a>
      </section>
    </main>
  );
}
function Lobby({
  view,
  playerId,
  send,
  leave,
}: {
  view: RoomView;
  playerId: string;
  send: (t: string, p?: unknown) => void;
  leave: () => void;
}) {
  const host = view.hostPlayerId === playerId;
  const seatCount = view.gameType === "texas42" ? 4 : 3;
  const seats = Array.from({ length: seatCount }, (_, i) =>
    view.players.find((p) => p.seat === i),
  );
  const me = view.players.find((p) => p.id === playerId);
  const invite = `${location.origin}/dominoes/room/${view.roomId}`;
  const patch = (p: Partial<Rules>) => send("UPDATE_RULES", p);
  return (
    <main className="entry-shell">
      <section className="entry-card lobby">
        <header>
          <div>
            <span className="eyebrow">
              Private {view.gameType === "moon" ? "Moon" : "Texas 42"} room
            </span>
            <h2>Pull up a chair</h2>
          </div>
          <div className="room-code">
            <small>Room</small>
            <strong>{view.roomId}</strong>
          </div>
        </header>
        <div className="invite">
          <input readOnly value={invite} />
          <button onClick={() => void navigator.clipboard.writeText(invite)}>
            Copy invite
          </button>
        </div>
        {view.gameType === "texas42" && (
          <p className="team-note">
            Partners sit across from one another: seats 1 and 3 versus seats 2
            and 4.
          </p>
        )}
        <div className="seats">
          {seats.map((p, i) => (
            <article
              key={i}
              className={view.gameType === "texas42" ? `team-${i % 2}` : ""}
            >
              <span className="avatar">
                {p?.isAI ? "AI" : p?.name.slice(0, 2).toUpperCase() || "○"}
              </span>
              <div>
                <strong>{p?.name || "Open seat"}</strong>
                <small>
                  {view.gameType === "texas42" ? `Team ${(i % 2) + 1} · ` : ""}
                  {p?.isAI
                    ? `${p.difficulty} computer`
                    : p?.connected
                      ? p.ready
                        ? "Ready"
                        : "Not ready"
                      : "Waiting"}
                </small>
              </div>
              {host && p?.isAI && (
                <button onClick={() => send("REMOVE_AI", { seat: i })}>
                  Remove
                </button>
              )}
              {host && !p && (
                <button
                  onClick={() =>
                    send("ADD_AI", { seat: i, difficulty: "medium" })
                  }
                >
                  Add AI
                </button>
              )}
            </article>
          ))}
        </div>
        {host && view.gameType === "moon" && (
          <fieldset className="rules">
            <legend>Moon rule options</legend>
            <label>
              Minimum bid
              <select
                value={view.rules.minimumBid}
                onChange={(e) =>
                  patch({ minimumBid: Number(e.target.value) as 3 | 4 | 5 })
                }
              >
                <option>3</option>
                <option>4</option>
                <option>5</option>
              </select>
            </label>
            <label>
              All players pass
              <select
                value={view.rules.allPass}
                onChange={(e) =>
                  patch({ allPass: e.target.value as Rules["allPass"] })
                }
              >
                <option value="redeal">Redeal</option>
                <option value="force-dealer">Force final bidder</option>
              </select>
            </label>
            <label>
              Widow
              <select
                value={view.rules.widow}
                onChange={(e) =>
                  patch({ widow: e.target.value as Rules["widow"] })
                }
              >
                <option value="exchange">Exchange required</option>
                <option value="optional">Exchange optional</option>
                <option value="none">No widow / 21 dominoes</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={view.rules.declareTrumpBeforeWidow}
                onChange={(e) =>
                  patch({ declareTrumpBeforeWidow: e.target.checked })
                }
              />{" "}
              Declare trump before seeing widow
            </label>
            <label>
              <input
                type="checkbox"
                checked={view.rules.allowDoublesTrump}
                onChange={(e) => patch({ allowDoublesTrump: e.target.checked })}
              />{" "}
              Allow doubles trump
            </label>
            <label>
              <input
                type="checkbox"
                checked={view.rules.allowFollowMe}
                onChange={(e) => patch({ allowFollowMe: e.target.checked })}
              />{" "}
              Allow no trump (“follow me”)
            </label>
            <label>
              Shoot the Moon
              <select
                value={view.rules.moonScoring}
                onChange={(e) =>
                  patch({ moonScoring: e.target.value as Rules["moonScoring"] })
                }
              >
                <option value="points">Worth ±21 points</option>
                <option value="instant">Immediate win/loss</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={view.rules.overcallMoon}
                onChange={(e) => patch({ overcallMoon: e.target.checked })}
              />{" "}
              Allow Shoot It Over (42)
            </label>
          </fieldset>
        )}
        {view.gameType === "texas42" && (
          <p className="team-note">
            Standard game: minimum bid 30, dealer must bid 30 if all others
            pass, all 28 dominoes, five count dominoes, and first team to seven
            marks.
          </p>
        )}
        <div className="actions">
          <button onClick={leave}>Leave</button>
          <button onClick={() => send("SET_READY", { ready: !me?.ready })}>
            {me?.ready ? "Not ready" : "Ready"}
          </button>
          {host && (
            <button
              className="primary"
              disabled={seats.some((s) => !s) || !me?.ready}
              onClick={() => send("START_GAME")}
            >
              Start game
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
function Game({
  view,
  playerId,
  error,
  send,
  leave,
}: {
  view: RoomView;
  playerId: string;
  error: string;
  send: (t: string, p?: unknown) => void;
  leave: () => void;
}) {
  const g = view.game;
  const me = view.players.find((p) => p.id === playerId);
  const count = view.gameType === "texas42" ? 4 : 3;
  const [displayedTrick, setDisplayedTrick] = useState<DisplayedTrickPlay[]>([]);
  const [collectingTrick, setCollectingTrick] = useState(false);
  const [trickWinnerSeat, setTrickWinnerSeat] = useState<number | null>(null);
  const trickPlayId = useRef(0);
  const trickClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenCompletedTrickSignature = useRef<string | null>(null);
  const bySeat = (s: number) => view.players.find((p) => p.seat === s);
  const relative = (offset: number) =>
    bySeat(((me?.seat || 0) + offset) % count);
  const trickOriginClass = (seat: number) => {
    const relativeSeat = (seat - (me?.seat || 0) + count) % count;
    if (relativeSeat === 0) return "from-south";
    if (relativeSeat === 1) return "from-west";
    if (relativeSeat === 2) return "from-north";
    return "from-east";
  };
  const trickCollectClass = (seat: number | null) => {
    if (seat === null) return "";
    const relativeSeat = (seat - (me?.seat || 0) + count) % count;
    if (relativeSeat === 0) return "to-south";
    if (relativeSeat === 1) return "to-west";
    if (relativeSeat === 2) return "to-north";
    return "to-east";
  };

  useEffect(
    () => () => {
      if (trickClearTimer.current) clearTimeout(trickClearTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (trickClearTimer.current) {
      clearTimeout(trickClearTimer.current);
      trickClearTimer.current = null;
    }

    const signature = g.trick.map((play) => `${play.seat}:${play.domino}`).join("|");
    if (g.trick.length === count && hiddenCompletedTrickSignature.current === signature) {
      if (displayedTrick.length) {
        setDisplayedTrick([]);
        setCollectingTrick(false);
        setTrickWinnerSeat(null);
      }
      return;
    }

    if (g.trick.length < count) {
      hiddenCompletedTrickSignature.current = null;
      if (collectingTrick) setCollectingTrick(false);
      if (trickWinnerSeat !== null) setTrickWinnerSeat(null);
    }

    setDisplayedTrick((prev) =>
      g.trick.map((play, index) => {
        const existing = prev[index];
        if (existing && existing.seat === play.seat && existing.domino === play.domino)
          return existing;
        trickPlayId.current += 1;
        return { ...play, id: trickPlayId.current };
      }),
    );

    if (g.trick.length === count) {
      const lastPlay = g.trick[g.trick.length - 1];
      const clearDelay =
        lastPlay && bySeat(lastPlay.seat)?.isAI
          ? TRICK_CLEAR_DELAY_AI_LAST_MS
          : TRICK_CLEAR_DELAY_MS;
      setTrickWinnerSeat(g.turnSeat);
      setCollectingTrick(true);
      trickClearTimer.current = setTimeout(() => {
        hiddenCompletedTrickSignature.current = signature;
        setDisplayedTrick([]);
        setCollectingTrick(false);
        setTrickWinnerSeat(null);
        trickClearTimer.current = null;
      }, clearDelay);
    }
  }, [collectingTrick, count, displayedTrick.length, g.trick, g.turnSeat, trickWinnerSeat]);

  const bidLabel = g.highBid
    ? (view.gameType === "texas42" && g.highBid > 42
        ? `${g.highBid / 42} marks`
        : String(g.highBid)) + ` — ${bySeat(g.bidderSeat!)?.name}`
    : "Open";
  return (
    <main className="game-shell">
      <header className="game-header">
        <strong>
          <span>{view.gameType === "moon" ? "Moon" : "Texas 42"}</span> Dominoes
        </strong>
        <div>Room {view.roomId}</div>
        <button onClick={leave}>Leave</button>
      </header>
      {error && <p className="game-error" role="alert">{error}</p>}
      <div className="status">
        <span>
          Hand <b>{g.handNumber}</b>
        </span>
        <span>
          Bid <b>{bidLabel}</b>
        </span>
        <span>
          Trump <b>{g.trump ?? "Not chosen"}</b>
        </span>
        {view.gameType === "texas42" && (
          <>
            <span>
              Marks{" "}
              <b>
                {g.teamMarks[0]}–{g.teamMarks[1]}
              </b>
            </span>
            <span>
              Hand points{" "}
              <b>
                {g.teamHandPoints[0]}–{g.teamHandPoints[1]}
              </b>
            </span>
          </>
        )}
      </div>
      <section className={`table ${view.gameType}`}>
        <PlayerCard
          p={relative(1)}
          pos="west"
          active={g.turnSeat === relative(1)?.seat}
        />
        <PlayerCard
          p={relative(2)}
          pos="north"
          active={g.turnSeat === relative(2)?.seat}
        />
        {view.gameType === "texas42" && (
          <PlayerCard
            p={relative(3)}
            pos="east"
            active={g.turnSeat === relative(3)?.seat}
          />
        )}
        <HiddenHand count={relative(1)?.dominoCount || 0} pos="west" />
        <HiddenHand count={relative(2)?.dominoCount || 0} pos="north" />
        {view.gameType === "texas42" && (
          <HiddenHand count={relative(3)?.dominoCount || 0} pos="east" />
        )}
        <div
          className={`trick ${collectingTrick ? `collecting ${trickCollectClass(trickWinnerSeat)}` : ""}`}
        >
          {displayedTrick.map((play) => (
            <div
              key={play.id}
              className={`trick-play ${trickOriginClass(play.seat)}`}
            >
              <Domino value={play.domino} />
            </div>
          ))}
        </div>
        {g.widowCount > 0 && (
          <div className="widow">
            <Domino hidden />
            <span>Widow</span>
          </div>
        )}
        <div className="message">{g.message}</div>
      </section>
      <section
        className={`hand ${g.turnSeat === me?.seat ? "active-hand" : ""}`}
      >
        <div>
          <strong>
            Your hand{" "}
            {view.gameType === "texas42" ? `· Team ${(me?.team ?? 0) + 1}` : ""}
          </strong>
          <span>
            {view.gameType === "moon"
              ? `${me?.score} points · ${me?.tricks} tricks`
              : `${me?.handPoints} hand points · ${me?.tricks} tricks`}
          </span>
        </div>
        <div className="hand-dominoes">
          {g.hand.map((d) => (
            <Domino
              key={d}
              value={d}
              legal={g.phase === "playing" && g.turnSeat === me?.seat}
              onClick={
                g.phase === "playing" && g.turnSeat === me?.seat
                  ? () => send("PLAY_DOMINO", { domino: d })
                  : undefined
              }
            />
          ))}
        </div>
      </section>
      <Decision
        g={g}
        rules={view.rules}
        gameType={view.gameType}
        meSeat={me?.seat ?? null}
        turnName={g.turnSeat === null ? null : bySeat(g.turnSeat)?.name ?? null}
        bidderName={g.bidderSeat === null ? null : bySeat(g.bidderSeat)?.name ?? null}
        send={send}
      />
      {g.phase === "complete" && (
        <div className="game-modal-backdrop" role="presentation">
          <section
            className="game-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-over-title"
          >
            <h2 id="game-over-title">Game over</h2>
            <p>{g.message}</p>
            {view.gameType === "texas42" ? (
              <p className="game-over-detail">
                Final marks: Team 1 {g.teamMarks[0]} - Team 2 {g.teamMarks[1]}
              </p>
            ) : (
              <div className="game-over-scores">
                {view.players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((player) => (
                    <span key={player.id}>
                      {player.name}: {player.score}
                    </span>
                  ))}
              </div>
            )}
            <div className="game-modal-actions">
              <button className="primary" onClick={() => send("REMATCH")}>
                Rematch
              </button>
              <button onClick={leave}>Quit</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
function PlayerCard({
  p,
  pos,
  active,
}: {
  p: RoomView["players"][number] | undefined;
  pos: string;
  active: boolean;
}) {
  return (
    <div className={`player ${pos} ${active ? "active" : ""}`}>
      <span className="avatar">
        {p?.isAI ? "AI" : p?.name.slice(0, 2).toUpperCase()}
      </span>
      <div>
        <strong>{p?.name}</strong>
        <small>
          {p?.score} pts · {p?.tricks} tricks
        </small>
      </div>
    </div>
  );
}
function HiddenHand({ count, pos }: { count: number; pos: string }) {
  return (
    <div className={`hidden-hand ${pos}`}>
      {Array.from({ length: count }, (_, i) => (
        <Domino hidden key={i} />
      ))}
    </div>
  );
}
function Decision({
  g,
  rules,
  gameType,
  meSeat,
  turnName,
  bidderName,
  send,
}: {
  g: RoomView["game"];
  rules: Rules;
  gameType: GameType;
  meSeat: number | null;
  turnName: string | null;
  bidderName: string | null;
  send: (t: string, p?: unknown) => void;
}) {
  if (g.phase === "bidding") {
    if (g.turnSeat !== meSeat)
      return (
        <section className="decision">
          <strong>{turnName || "Another player"} is bidding</strong>
        </section>
      );
    if (gameType === "texas42") {
      const start = Math.max(30, (g.highBid || 29) + 1),
        pointBids = Array.from(
          { length: Math.max(0, 43 - start) },
          (_, i) => start + i,
        );
      return (
        <section className="decision">
          <strong>Your Texas 42 bid</strong>
          <div>
            {pointBids.map((n) => (
              <button key={n} onClick={() => send("BID", { bid: n })}>
                {n}
              </button>
            ))}
            {(g.highBid || 0) < 84 && (
              <button
                className="primary"
                onClick={() => send("BID", { bid: 84 })}
              >
                2 marks
              </button>
            )}
            {(g.highBid || 0) >= 84 && (
              <button
                className="primary"
                onClick={() =>
                  send("BID", {
                    bid: Math.ceil(((g.highBid || 84) + 1) / 42) * 42,
                  })
                }
              >
                {Math.ceil(((g.highBid || 84) + 1) / 42)} marks
              </button>
            )}
            <button onClick={() => send("PASS")}>Pass</button>
          </div>
        </section>
      );
    }
    return (
      <section className="decision">
        <strong>Your bid</strong>
        <div>
          {Array.from(
            { length: 8 - rules.minimumBid },
            (_, i) => rules.minimumBid + i,
          )
            .filter((n) => n > (g.highBid || 0))
            .map((n) => (
              <button key={n} onClick={() => send("BID", { bid: n })}>
                {n}
              </button>
            ))}
          <button className="primary" onClick={() => send("BID", { bid: 21 })}>
            Shoot the Moon
          </button>
          <button onClick={() => send("PASS")}>Pass</button>
        </div>
      </section>
    );
  }
  if (g.phase === "trump")
    if (g.bidderSeat !== meSeat)
      return (
        <section className="decision">
          <strong>{bidderName || "The winning bidder"} is choosing trump</strong>
        </section>
      );
  if (g.phase === "trump")
    return (
      <section className="decision">
        <strong>Choose trump</strong>
        <div>
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} onClick={() => send("CHOOSE_TRUMP", { trump: n })}>
              {n}
            </button>
          ))}
          {(gameType === "texas42" || rules.allowDoublesTrump) && (
            <button
              onClick={() =>
                send("CHOOSE_TRUMP", { trump: "doubles" satisfies Trump })
              }
            >
              Doubles
            </button>
          )}
          {(gameType === "texas42" || rules.allowFollowMe) && (
            <button
              onClick={() =>
                send("CHOOSE_TRUMP", { trump: "follow-me" satisfies Trump })
              }
            >
              Follow me
            </button>
          )}
        </div>
      </section>
    );
  if (g.phase === "widow")
    if (g.bidderSeat !== meSeat)
      return (
        <section className="decision">
          <strong>{bidderName || "The winning bidder"} is handling the widow</strong>
        </section>
      );
  if (g.phase === "widow")
    return (
      <section className="decision">
        <strong>Pick up the widow, then discard one domino</strong>
        <div>
          {g.hand.map((d) => (
            <button key={d} onClick={() => send("DISCARD", { domino: d })}>
              {d}
            </button>
          ))}
          {rules.widow === "optional" && (
            <button onClick={() => send("SKIP_WIDOW")}>
              Keep original hand
            </button>
          )}
        </div>
      </section>
    );
  if (g.phase === "hand-end")
    return (
      <section className="decision">
        <strong>{g.message}</strong>
        <button className="primary" onClick={() => send("NEXT_HAND")}>
          Deal next hand
        </button>
      </section>
    );
  if (g.phase === "complete")
    return null;
  return null;
}
