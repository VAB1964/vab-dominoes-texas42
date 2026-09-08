import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RoomClient } from "./client";
import { Domino } from "./domino";
import { HiddenHand, PlayerCard } from "./table-components";
import { Tutorial } from "./Tutorial";
import {
  scheduleTrickTimeline,
  TRICK_COLLECT_ANIMATION_MS,
  TRICK_WINNER_DISPLAY_MS,
} from "./trick-timeline";
import type {
  Domino as D,
  EventEnvelope,
  GameType,
  PresentationSync,
  RoomView,
  Rules,
  Trump,
} from "./types";
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
const OPENING_DRAW_DISPLAY_MS = 5000;
const BUTTON_CLICK_VOLUME = 0.03;
const PLAYER_NOTES = [523.25, 659.25, 783.99, 880] as const;
const MAX_DEBUG_LINES = 500;
const DEFERRED_EVENT_STAGGER_MS = 100;
const POST_CLEAR_PLAYBACK_DELAY_MS = 120;
const DEFERRED_EVENT_INITIAL_DELAY_MS = 60;
type DisplayedTrickPlay = RoomView["game"]["trick"][number] & {
  id: string;
  playId: number;
  trickId: number;
  noEntryAnimation?: boolean;
};
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
  const inviteOnlyEntry = Boolean(invite);
  const [screen, setScreen] = useState<"home" | "room" | "game" | "tutorial">(
    invite ? "room" : "home",
  );
  const [name, setName] = useState(localStorage.getItem("moon.name") || "");
  const [gameType, setGameType] = useState<GameType>("moon");
  const [code, setCode] = useState(invite);
  const [joinCode, setJoinCode] = useState(invite);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<RoomView | null>(null);
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [presentationSync, setPresentationSync] = useState<PresentationSync | null>(null);
  const [error, setError] = useState("");
  const client = useRef<RoomClient | null>(null);
  const clickAudioContext = useRef<AudioContext | null>(null);
  const playPlayerTone = useCallback((seat: number) => {
    const context = clickAudioContext.current;
    if (!context || context.state === "closed") return;
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime + 0.008;
    const frequency = PLAYER_NOTES[seat] ?? PLAYER_NOTES[0];
    (
      [
        ["sine", frequency, 0.038],
        ["triangle", frequency * 2, 0.009],
      ] as const
    ).forEach(([wave, hz, peak]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(hz, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(peak * 0.62, start + 0.13);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.33);
    });
  }, []);

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
    setEvents([]);
    setPresentationSync(null);
    setCode(room);
    setScreen("room");
    const c = new RoomClient(room, (next, err, event, sync) => {
      if (err) setError(err);
      if (sync) {
        setEvents([]);
        setPresentationSync(sync);
      }
      if (event) {
        setEvents((prev) =>
          prev.length > 300 ? [...prev.slice(prev.length - 150), event] : [...prev, event],
        );
      }
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
        events={events}
        presentationSync={presentationSync}
        playPlayerTone={playPlayerTone}
        playerId={client.current?.playerId || ""}
        error={error}
        send={(t, p) => client.current?.send(t, p)}
        leave={() => {
          client.current?.close();
          setScreen("home");
          setView(null);
          setEvents([]);
          setPresentationSync(null);
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
          setEvents([]);
          setPresentationSync(null);
        }}
      />
    );
  if (screen === "tutorial") {
    return (
      <Tutorial
        playPlayerTone={playPlayerTone}
        onExit={() => setScreen("home")}
      />
    );
  }
  return (
    <main className="entry-shell">
      <section className="entry-card">
        <span className="eyebrow">VAB Games presents</span>
        <h1>Domino Card Room</h1>
        <p>
          {inviteOnlyEntry
            ? "Enter your name and room code to continue."
            : "Choose three-player Moon or four-player partnership Texas 42. Invite friends or fill open chairs with AI players."}
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!inviteOnlyEntry && (
          <>
            <button className="learn-button" onClick={() => setScreen("tutorial")}>
              <strong>Learn to play</strong>
              <span>Interactive Moon and Texas 42 lessons · no name required</span>
            </button>
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
          </>
        )}
        <label>
          {inviteOnlyEntry ? "Name" : "Your name"}
          <input
            maxLength={24}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {!inviteOnlyEntry && (
          <>
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
          </>
        )}
        <label>
          {inviteOnlyEntry ? "Code" : "Room code"}
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
          {inviteOnlyEntry ? "Continue" : "Join game"}
        </button>
        {!inviteOnlyEntry && <a href="https://vabgames.com">Back to VABGames.com</a>}
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
  events,
  presentationSync,
  playPlayerTone,
  playerId,
  error,
  send,
  leave,
}: {
  view: RoomView;
  events: EventEnvelope[];
  presentationSync: PresentationSync | null;
  playPlayerTone: (seat: number) => void;
  playerId: string;
  error: string;
  send: (t: string, p?: unknown) => void;
  leave: () => void;
}) {
  const g = view.game;
  const me = view.players.find((p) => p.id === playerId);
  const count = view.gameType === "texas42" ? 4 : 3;
  const [displayedTrick, setDisplayedTrick] = useState<DisplayedTrickPlay[]>([]);
  const [trickPhase, setTrickPhase] = useState<
    "cleared" | "building" | "winnerHold" | "collecting"
  >("cleared");
  const [showOpeningDraw, setShowOpeningDraw] = useState(false);
  const [trickWinnerSeat, setTrickWinnerSeat] = useState<number | null>(null);
  const [presentedTurnSeat, setPresentedTurnSeat] = useState<number | null>(g.turnSeat);
  const [presentedMessage, setPresentedMessage] = useState(g.message);
  const [presentedPhase, setPresentedPhase] = useState(g.phase);
  const [presentedDominoCounts, setPresentedDominoCounts] = useState<Record<number, number>>(
    () => Object.fromEntries(view.players.map((player) => [player.seat, player.dominoCount])),
  );
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [debugOpen, setDebugOpen] = useState(true);
  const openingDrawSeenSignature = useRef<string | null>(null);
  const openingDrawTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickElement = useRef<HTMLDivElement | null>(null);
  const clearTimeline = useRef<(() => void) | null>(null);
  const queueDrainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredPlaybackTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const deferredPlaybackPending = useRef(0);
  const processedSeq = useRef(0);
  const appliedPresentationSync = useRef<PresentationSync | null>(null);
  const deferredEvents = useRef<EventEnvelope[]>([]);
  const phaseRef = useRef(trickPhase);
  const presentedTrickIdRef = useRef<number | null>(null);
  const currentHandIdRef = useRef<number>(g.handId);
  const sessionStartMs = useRef(Date.now());
  const debugEnabled = useMemo(
    () => new URLSearchParams(location.search).get("debugRender") === "1",
    [],
  );
  const pushDebug = useCallback(
    (label: string, details = "") => {
      if (!debugEnabled) return;
      const elapsedMs = Date.now() - sessionStartMs.current;
      const elapsed = `${(elapsedMs / 1000).toFixed(3)}s`;
      const line = `${elapsed} | ${label}${details ? ` | ${details}` : ""}`;
      setDebugLines((prev) => {
        const next = prev.length >= MAX_DEBUG_LINES ? [...prev.slice(prev.length - 250), line] : [...prev, line];
        return next;
      });
    },
    [debugEnabled],
  );
  const bySeat = (s: number) => view.players.find((p) => p.seat === s);
  const teamLabel = (team: number) => {
    const names = view.players
      .filter((player) => player.team === team)
      .sort((a, b) => a.seat - b.seat)
      .map((player) => player.name);
    return names.length ? `Team (${names.join(" & ")})` : `Team ${team + 1}`;
  };
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

  useEffect(() => {
    phaseRef.current = trickPhase;
  }, [trickPhase]);

  useLayoutEffect(() => {
    if (!debugEnabled) return;
    const describeDom = () =>
      Array.from(trickElement.current?.querySelectorAll<HTMLElement>(".trick-play") ?? [])
        .map(
          (node) =>
            `${node.dataset.trickId}:${node.dataset.playId}:${getComputedStyle(node).opacity}`,
        )
        .join(",");
    pushDebug(
      "DOM_COMMIT",
      `phase=${trickPhase} state=[${displayedTrick.map((play) => `${play.trickId}:${play.playId}`).join(",")}] dom=[${describeDom()}]`,
    );
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        pushDebug("DOM_PAINT", `phase=${phaseRef.current} dom=[${describeDom()}]`);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [debugEnabled, displayedTrick, pushDebug, trickPhase]);

  useEffect(() => {
    pushDebug(
      "AUTHORITATIVE_VIEW",
      `hand=${g.handId} trick=${g.trickId} plays=${g.trick.length} phase=${g.phase} turn=${g.turnSeat} counts=[${view.players.map((player) => `${player.seat}:${player.dominoCount}`).join(",")}] message=${g.message}`,
    );
  }, [
    g.handId,
    g.message,
    g.phase,
    g.trick.length,
    g.trickId,
    g.turnSeat,
    pushDebug,
    view.players,
  ]);

  useEffect(
    () => () => {
      if (openingDrawTimer.current) clearTimeout(openingDrawTimer.current);
      if (clearTimeline.current) clearTimeline.current();
      if (queueDrainTimer.current) clearTimeout(queueDrainTimer.current);
      for (const timer of deferredPlaybackTimers.current) clearTimeout(timer);
      deferredPlaybackTimers.current = [];
      deferredPlaybackPending.current = 0;
    },
    [],
  );

  useEffect(() => {
    if (!g.openingDrawActive || g.openingDraw.length === 0) return;
    const drawSignature = `${g.handNumber}:${g.openingDraw
      .map((draw) => `${draw.seat}:${draw.domino}`)
      .join("|")}`;
    if (openingDrawSeenSignature.current === drawSignature) return;
    openingDrawSeenSignature.current = drawSignature;
    pushDebug("OPENING_DRAW_SHOW", drawSignature);
    setShowOpeningDraw(true);
    if (openingDrawTimer.current) clearTimeout(openingDrawTimer.current);
    openingDrawTimer.current = setTimeout(() => {
      setShowOpeningDraw(false);
      pushDebug("OPENING_DRAW_HIDE");
      openingDrawTimer.current = null;
    }, OPENING_DRAW_DISPLAY_MS);
  }, [g.handNumber, g.openingDraw, g.openingDrawActive, pushDebug]);

  useEffect(() => {
    if (currentHandIdRef.current !== g.handId) {
      pushDebug("HAND_CHANGED", `from=${currentHandIdRef.current} to=${g.handId}`);
      currentHandIdRef.current = g.handId;
      presentedTrickIdRef.current = null;
      deferredEvents.current = [];
      for (const timer of deferredPlaybackTimers.current) clearTimeout(timer);
      deferredPlaybackTimers.current = [];
      deferredPlaybackPending.current = 0;
      setDisplayedTrick([]);
      setTrickWinnerSeat(null);
      phaseRef.current = "cleared";
      setTrickPhase("cleared");
      setPresentedPhase(g.phase);
      setPresentedTurnSeat(g.turnSeat);
      setPresentedMessage(g.message);
      setPresentedDominoCounts(
        Object.fromEntries(view.players.map((player) => [player.seat, 7])),
      );
    }
  }, [g.handId, g.message, g.phase, g.turnSeat, pushDebug, view.players]);

  useEffect(() => {
    if (g.phase === "playing") {
      if (
        presentedTrickIdRef.current === null &&
        displayedTrick.length === 0 &&
        phaseRef.current === "cleared"
      ) {
        setPresentedPhase("playing");
        setPresentedTurnSeat(g.turnSeat);
        setPresentedMessage(g.message);
        setPresentedDominoCounts(
          Object.fromEntries(view.players.map((player) => [player.seat, player.dominoCount])),
        );
        pushDebug(
          "PRESENTATION_PLAY_START",
          `hand=${g.handId} turn=${g.turnSeat} message=${g.message}`,
        );
      }
      return;
    }
    if (g.phase === "hand-end" || g.phase === "complete") return;
    setPresentedPhase(g.phase);
    setPresentedTurnSeat(g.turnSeat);
    setPresentedMessage(g.message);
    setPresentedDominoCounts(
      Object.fromEntries(view.players.map((player) => [player.seat, player.dominoCount])),
    );
  }, [
    displayedTrick.length,
    g.handId,
    g.message,
    g.phase,
    g.turnSeat,
    pushDebug,
    view.players,
  ]);

  const processDeferredQueue = () => {
    if (!deferredEvents.current.length) return;
    if (phaseRef.current === "winnerHold" || phaseRef.current === "collecting") {
      pushDebug("QUEUE_DRAIN_BLOCKED", `phase=${phaseRef.current} pending=${deferredEvents.current.length}`);
      if (queueDrainTimer.current) clearTimeout(queueDrainTimer.current);
      queueDrainTimer.current = setTimeout(() => {
        queueDrainTimer.current = null;
        processDeferredQueue();
      }, 0);
      return;
    }
    pushDebug("QUEUE_DRAIN_START", `count=${deferredEvents.current.length}`);
    const queued = [...deferredEvents.current].sort((a, b) => a.seq - b.seq);
    deferredEvents.current = [];
    for (const timer of deferredPlaybackTimers.current) clearTimeout(timer);
    deferredPlaybackTimers.current = [];
    deferredPlaybackPending.current = queued.length;
    queued.forEach((envelope, index) => {
      const timer = setTimeout(() => {
        applyEvent(envelope, true);
        deferredPlaybackPending.current = Math.max(0, deferredPlaybackPending.current - 1);
      }, DEFERRED_EVENT_INITIAL_DELAY_MS + index * DEFERRED_EVENT_STAGGER_MS);
      deferredPlaybackTimers.current.push(timer);
    });
    pushDebug(
      "QUEUE_PLAYBACK_SCHEDULED",
      `count=${queued.length} delayMs=${DEFERRED_EVENT_INITIAL_DELAY_MS} staggerMs=${DEFERRED_EVENT_STAGGER_MS}`,
    );
    pushDebug("QUEUE_DRAIN_END", `remaining=${deferredEvents.current.length}`);
  };

  const startWinnerSequence = (winnerSeat: number) => {
    if (clearTimeline.current) clearTimeline.current();
    pushDebug("PHASE_WINNER_HOLD", `winnerSeat=${winnerSeat} trickId=${presentedTrickIdRef.current}`);
    setTrickWinnerSeat(winnerSeat);
    phaseRef.current = "winnerHold";
    setTrickPhase("winnerHold");
    clearTimeline.current = scheduleTrickTimeline(
      () => {
        pushDebug("PHASE_COLLECTING", `trickId=${presentedTrickIdRef.current}`);
        phaseRef.current = "collecting";
        setTrickPhase("collecting");
      },
      () => {
        pushDebug("PHASE_CLEARED", `trickId=${presentedTrickIdRef.current}`);
        setDisplayedTrick([]);
        setTrickWinnerSeat(null);
        phaseRef.current = "cleared";
        setTrickPhase("cleared");
        // Keep last presented trick latched so snapshot fallback cannot
        // re-hydrate the same completed trick while waiting for next lead.
        if (queueDrainTimer.current) clearTimeout(queueDrainTimer.current);
        queueDrainTimer.current = setTimeout(() => {
          queueDrainTimer.current = null;
          processDeferredQueue();
        }, POST_CLEAR_PLAYBACK_DELAY_MS);
      },
      TRICK_WINNER_DISPLAY_MS,
      TRICK_COLLECT_ANIMATION_MS,
    );
  };

  const applyEvent = (envelope: EventEnvelope, fromDeferred = false) => {
    const roomEvent = envelope.event;
    pushDebug(
      "EVENT_RECEIVED",
      `seq=${envelope.seq} type=${roomEvent.type} hand=${roomEvent.handId}${"trickId" in roomEvent ? ` trick=${roomEvent.trickId}` : ""}${fromDeferred ? " deferred=true" : ""}`,
    );
    if (roomEvent.handId !== g.handId) return;
    const currentlyLocked = phaseRef.current === "winnerHold" || phaseRef.current === "collecting";
    const isTrickEvent = roomEvent.type === "PLAY_ADDED" || roomEvent.type === "TRICK_COMPLETED";
    if (
      isTrickEvent &&
      currentlyLocked &&
      presentedTrickIdRef.current !== null &&
      roomEvent.trickId !== presentedTrickIdRef.current
    ) {
      deferredEvents.current.push(envelope);
      pushDebug(
        "EVENT_DEFERRED",
        `seq=${envelope.seq} currentTrick=${presentedTrickIdRef.current} incomingTrick=${roomEvent.trickId} phase=${phaseRef.current}`,
      );
      return;
    }
    if (
      roomEvent.type === "HAND_COMPLETED" &&
      (phaseRef.current === "winnerHold" || phaseRef.current === "collecting")
    ) {
      deferredEvents.current.push(envelope);
      pushDebug("EVENT_DEFERRED", `seq=${envelope.seq} type=HAND_COMPLETED phase=${phaseRef.current}`);
      return;
    }

    if (roomEvent.type === "PLAY_ADDED") {
      if (presentedTrickIdRef.current !== roomEvent.trickId) {
        pushDebug("TRICK_SWITCH", `from=${presentedTrickIdRef.current} to=${roomEvent.trickId}`);
        presentedTrickIdRef.current = roomEvent.trickId;
        setDisplayedTrick([]);
      }
      if (phaseRef.current === "cleared") {
        phaseRef.current = "building";
        setTrickPhase("building");
      }
      setPresentedPhase("playing");
      setPresentedDominoCounts((previous) => ({
        ...previous,
        [roomEvent.seat]: Math.max(0, (previous[roomEvent.seat] ?? 1) - 1),
      }));
      const nextSeat = (roomEvent.seat + 1) % count;
      setPresentedTurnSeat(nextSeat);
      setPresentedMessage(`${bySeat(nextSeat)?.name ?? "Next player"} follows.`);
      playPlayerTone(roomEvent.seat);
      setDisplayedTrick((prev) => {
        const existingIndex = prev.findIndex((play) => play.playId === roomEvent.playId);
        if (existingIndex >= 0) {
          return prev;
        }
        return prev.concat({
          id: `play-${roomEvent.playId}`,
          playId: roomEvent.playId,
          trickId: roomEvent.trickId,
          seat: roomEvent.seat,
          domino: roomEvent.domino,
          noEntryAnimation: false,
        });
      });
      return;
    }

    if (roomEvent.type === "TRICK_COMPLETED") {
      if (presentedTrickIdRef.current !== roomEvent.trickId) {
        presentedTrickIdRef.current = roomEvent.trickId;
      }
      setDisplayedTrick(
        roomEvent.plays.map((play) => ({
          id: `play-${play.playId}`,
          playId: play.playId,
          trickId: roomEvent.trickId,
          seat: play.seat,
          domino: play.domino,
          noEntryAnimation: fromDeferred,
        })),
      );
      setPresentedTurnSeat(roomEvent.winnerSeat);
      setPresentedMessage(`${bySeat(roomEvent.winnerSeat)?.name ?? "Player"} wins the trick.`);
      startWinnerSequence(roomEvent.winnerSeat);
      return;
    }

    if (roomEvent.type === "HAND_COMPLETED") {
      pushDebug("HAND_COMPLETED_EVENT", `phase=${roomEvent.phase}`);
      deferredEvents.current = [];
      setPresentedPhase(roomEvent.phase);
      setPresentedTurnSeat(null);
      setPresentedMessage(roomEvent.message);
    }
  };

  useEffect(() => {
    if (!presentationSync) return;
    if (appliedPresentationSync.current === presentationSync) return;
    appliedPresentationSync.current = presentationSync;
    if (presentationSync.snapshot.revision < view.revision) {
      processedSeq.current = presentationSync.seq;
      currentHandIdRef.current = g.handId;
      presentedTrickIdRef.current = null;
      deferredEvents.current = [];
      setDisplayedTrick([]);
      setTrickWinnerSeat(null);
      phaseRef.current = "cleared";
      setTrickPhase("cleared");
      setPresentedPhase(g.phase);
      setPresentedTurnSeat(g.turnSeat);
      setPresentedMessage(g.message);
      setPresentedDominoCounts(
        Object.fromEntries(
          view.players.map((player) => [
            player.seat,
            g.phase === "playing" ? 7 : player.dominoCount,
          ]),
        ),
      );
      pushDebug(
        "PRESENTATION_SYNC_STALE",
        `syncRevision=${presentationSync.snapshot.revision} currentRevision=${view.revision} usingCurrentHand=${g.handId} phase=${g.phase}`,
      );
      return;
    }
    const snapshot = presentationSync.snapshot.game;
    if (clearTimeline.current) clearTimeline.current();
    if (queueDrainTimer.current) clearTimeout(queueDrainTimer.current);
    for (const timer of deferredPlaybackTimers.current) clearTimeout(timer);
    deferredPlaybackTimers.current = [];
    deferredPlaybackPending.current = 0;
    deferredEvents.current = [];
    processedSeq.current = presentationSync.seq;
    currentHandIdRef.current = snapshot.handId;
    presentedTrickIdRef.current = snapshot.trick.length ? snapshot.trickId : null;
    setTrickWinnerSeat(null);
    setPresentedPhase(snapshot.phase);
    setPresentedTurnSeat(snapshot.turnSeat);
    setPresentedMessage(snapshot.message);
    setPresentedDominoCounts(
      Object.fromEntries(
        presentationSync.snapshot.players.map((player) => [player.seat, player.dominoCount]),
      ),
    );
    setDisplayedTrick(
      snapshot.trick.map((play, index) => ({
        id: `sync-${snapshot.handId}-${snapshot.trickId}-${index}`,
        playId: -1 - index,
        trickId: snapshot.trickId,
        seat: play.seat,
        domino: play.domino,
        noEntryAnimation: true,
      })),
    );
    pushDebug(
      "PRESENTATION_SYNC",
      `reason=${presentationSync.reason} seq=${presentationSync.seq} hand=${snapshot.handId} trick=${snapshot.trickId} plays=${snapshot.trick.length}`,
    );
    if (snapshot.phase === "playing" && snapshot.trick.length === count) {
      presentedTrickIdRef.current = snapshot.trickId;
      startWinnerSequence(snapshot.turnSeat ?? snapshot.trick.at(-1)?.seat ?? 0);
    } else {
      const nextPhase = snapshot.trick.length ? "building" : "cleared";
      phaseRef.current = nextPhase;
      setTrickPhase(nextPhase);
    }
  }, [count, g.handId, g.message, g.phase, g.turnSeat, presentationSync, pushDebug, view]);

  useEffect(() => {
    for (const envelope of events) {
      if (envelope.seq <= processedSeq.current) continue;
      if (envelope.seq > processedSeq.current + 1) {
        pushDebug(
          "SEQ_GAP_WAIT",
          `expected=${processedSeq.current + 1} incoming=${envelope.seq}`,
        );
        return;
      }
      processedSeq.current = envelope.seq;
      applyEvent(envelope, false);
    }
  }, [events, g.handId, pushDebug]);

  const showTrickWinner = trickPhase === "winnerHold";
  const collectingTrick = trickPhase === "collecting";
  const bidLabel = g.highBid
    ? (view.gameType === "texas42" && g.highBid > 42
        ? `${g.highBid / 42} marks`
        : String(g.highBid)) + ` — ${bySeat(g.bidderSeat!)?.name}`
    : "Open";
  const trickWinnerName =
    trickWinnerSeat === null ? null : bySeat(trickWinnerSeat)?.name ?? null;
  const openingLeader =
    g.openingLeaderSeat === null ? null : bySeat(g.openingLeaderSeat);
  const presentationGame = {
    ...g,
    phase: presentedPhase,
    turnSeat: presentedTurnSeat,
    message: presentedMessage,
  };
  const presentedCount = (seat: number | undefined) =>
    seat === undefined ? 0 : presentedDominoCounts[seat] ?? 0;
  const waitingForTrick =
    presentedPhase === "playing" &&
    presentedTurnSeat === me?.seat &&
    (trickPhase === "winnerHold" || trickPhase === "collecting");
  const canPlay =
    presentedPhase === "playing" &&
    presentedTurnSeat === me?.seat &&
    !waitingForTrick;
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
              Game score{" "}
              <b>
                {teamLabel(0)} {g.teamMarks[0]} · {teamLabel(1)} {g.teamMarks[1]}
              </b>
            </span>
            <span>
              Hand points{" "}
              <b>
                {teamLabel(0)} {g.teamHandPoints[0]} · {teamLabel(1)} {g.teamHandPoints[1]}
              </b>
            </span>
          </>
        )}
      </div>
      <section className={`table ${view.gameType}`}>
        <PlayerCard
          p={relative(1)}
          pos="west"
          active={presentedTurnSeat === relative(1)?.seat}
        />
        <PlayerCard
          p={relative(2)}
          pos="north"
          active={presentedTurnSeat === relative(2)?.seat}
        />
        {view.gameType === "texas42" && (
          <PlayerCard
            p={relative(3)}
            pos="east"
            active={presentedTurnSeat === relative(3)?.seat}
          />
        )}
        <HiddenHand
          count={presentedCount(relative(1)?.seat)}
          pos="west"
          seat={relative(1)?.seat}
          active={presentedTurnSeat === relative(1)?.seat}
        />
        <HiddenHand
          count={presentedCount(relative(2)?.seat)}
          pos="north"
          seat={relative(2)?.seat}
          active={presentedTurnSeat === relative(2)?.seat}
        />
        {view.gameType === "texas42" && (
          <HiddenHand
            count={presentedCount(relative(3)?.seat)}
            pos="east"
            seat={relative(3)?.seat}
            active={presentedTurnSeat === relative(3)?.seat}
          />
        )}
        {showOpeningDraw && g.openingDraw.length > 0 && (
          <section className="opening-draw" role="status" aria-live="polite">
            <strong>Draw for first lead</strong>
            <div className="opening-draw-list">
              {g.openingDraw.map((draw) => {
                const player = bySeat(draw.seat);
                const ownerLabel = draw.seat === me?.seat ? "You" : player?.name || "Player";
                const isLeader = draw.seat === g.openingLeaderSeat;
                return (
                  <article key={`${draw.seat}-${draw.domino}`} className={isLeader ? "leader" : ""}>
                    <Domino value={draw.domino} />
                    <span>{ownerLabel}</span>
                  </article>
                );
              })}
            </div>
            <p>
              <b>{openingLeader?.name || "Winner"}</b> drew highest and opens the bidding.
            </p>
          </section>
        )}
        <div
          ref={trickElement}
          className={`trick ${showTrickWinner ? "winner-spotlight" : ""} ${collectingTrick ? `collecting ${trickCollectClass(trickWinnerSeat)}` : ""}`}
          onAnimationStart={(event) => {
            const node = event.target as HTMLElement;
            if (node.classList.contains("trick-play")) {
              pushDebug(
                "ANIMATION_START",
                `name=${event.animationName} trick=${node.dataset.trickId} play=${node.dataset.playId}`,
              );
            }
          }}
          onAnimationEnd={(event) => {
            const node = event.target as HTMLElement;
            if (node.classList.contains("trick-play")) {
              pushDebug(
                "ANIMATION_END",
                `name=${event.animationName} trick=${node.dataset.trickId} play=${node.dataset.playId}`,
              );
            }
          }}
          onTransitionEnd={(event) => {
            const node = event.target as HTMLElement;
            if (node.classList.contains("trick-play")) {
              pushDebug(
                "TRANSITION_END",
                `property=${event.propertyName} phase=${phaseRef.current} trick=${node.dataset.trickId} play=${node.dataset.playId}`,
              );
            }
          }}
        >
          {displayedTrick.map((play) => (
            <div
              key={play.id}
              data-trick-id={play.trickId}
              data-play-id={play.playId}
              className={`trick-play player-color-${play.seat} ${trickOriginClass(play.seat)} ${showTrickWinner && play.seat === trickWinnerSeat ? "winner" : ""} ${play.noEntryAnimation || collectingTrick ? "no-entry" : ""}`}
            >
              <Domino value={play.domino} />
            </div>
          ))}
        </div>
        {showTrickWinner && trickWinnerName && (
          <div className="trick-winner-banner">
            <strong>{trickWinnerName}</strong> wins the trick
          </div>
        )}
        {g.widowCount > 0 && (
          <div className="widow">
            <Domino hidden />
            <span>Widow</span>
          </div>
        )}
        {presentedPhase === "hand-end" && (
          <section className="table-center-overlay hand-result-modal" role="status" aria-live="polite">
            <h2>Hand complete</h2>
            <p>{presentedMessage}</p>
            {view.gameType === "texas42" ? (
              <div className="result-grid">
                <span>{teamLabel(0)}</span>
                <b>
                  {g.teamHandPoints[0]} hand points · {g.teamMarks[0]} marks
                </b>
                <span>{teamLabel(1)}</span>
                <b>
                  {g.teamHandPoints[1]} hand points · {g.teamMarks[1]} marks
                </b>
              </div>
            ) : (
              <div className="result-grid">
                {view.players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((player) => (
                    <span key={player.id}>
                      {player.name}: {player.score} points
                    </span>
                  ))}
              </div>
            )}
            <div className="game-modal-actions">
              <button className="primary" onClick={() => send("NEXT_HAND")}>
                Deal next hand
              </button>
            </div>
          </section>
        )}
        <div className="message">{presentedMessage}</div>
      </section>
      <section
        className={`hand player-color-${me?.seat ?? 0} ${canPlay ? "active-hand" : ""} ${waitingForTrick ? "waiting-for-trick" : ""}`}
      >
        <div>
          <strong>
            Your hand{" "}
            {view.gameType === "texas42" ? `· ${teamLabel(me?.team ?? 0)}` : ""}
          </strong>
          <span>
            {waitingForTrick
              ? "Waiting for the trick to clear…"
              : view.gameType === "moon"
                ? `${me?.score} points · ${me?.tricks} tricks`
                : `${me?.handPoints} hand points · ${me?.tricks} tricks`}
          </span>
        </div>
        <div className="hand-dominoes">
          {g.hand.map((d) => (
            <Domino
              key={d}
              value={d}
              legal={canPlay}
              onClick={
                canPlay
                  ? () => send("PLAY_DOMINO", { domino: d })
                  : undefined
              }
            />
          ))}
        </div>
      </section>
      <Decision
        g={presentationGame}
        rules={view.rules}
        gameType={view.gameType}
        meSeat={me?.seat ?? null}
        turnName={presentedTurnSeat === null ? null : bySeat(presentedTurnSeat)?.name ?? null}
        bidderName={g.bidderSeat === null ? null : bySeat(g.bidderSeat)?.name ?? null}
        send={send}
      />
      {presentedPhase === "complete" && (
        <div className="game-modal-backdrop" role="presentation">
          <section
            className="game-modal game-over-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-over-title"
          >
            <h2 id="game-over-title">Game over</h2>
            <p>{presentedMessage}</p>
            {view.gameType === "texas42" ? (
              <p className="game-over-detail">
                Final marks: {teamLabel(0)} {g.teamMarks[0]} · {teamLabel(1)} {g.teamMarks[1]}
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
      {debugEnabled && (
        <section className="debug-log-panel">
          <header>
            <strong>Render debug</strong>
            <div>
              <button onClick={() => setDebugOpen((open) => !open)}>
                {debugOpen ? "Collapse" : "Expand"}
              </button>
              <button
                onClick={() => {
                  const body = debugLines.join("\n");
                  void navigator.clipboard.writeText(body);
                }}
              >
                Copy log
              </button>
              <button onClick={() => setDebugLines([])}>Clear</button>
            </div>
          </header>
          {debugOpen && (
            <pre>
              {debugLines.length
                ? debugLines.join("\n")
                : "No debug events yet. Play a trick to capture the timeline."}
            </pre>
          )}
        </section>
      )}
    </main>
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
                title="Bid 84 and take all 42 points. Two marks go to the team that wins the contract."
                onClick={() => send("BID", { bid: 84 })}
              >
                2 marks
              </button>
            )}
            {(g.highBid || 0) >= 84 && (
              <button
                className="primary"
                title="Bid every point for the displayed number of marks. If your team misses even one point, the opponents earn those marks."
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
          <small className="specialty-help">
            Bids 30–42 risk one mark. A 2-mark bid means taking all 42 points;
            if your team misses even one point, the opponents receive both marks.
          </small>
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
              title="All doubles form their own trump suit."
              onClick={() =>
                send("CHOOSE_TRUMP", { trump: "doubles" satisfies Trump })
              }
            >
              Doubles
            </button>
          )}
          {(gameType === "texas42" || rules.allowFollowMe) && (
            <button
              title="No trump suit. The high end of the lead establishes the suit."
              onClick={() =>
                send("CHOOSE_TRUMP", { trump: "follow-me" satisfies Trump })
              }
            >
              Follow me
            </button>
          )}
        </div>
        <small className="specialty-help">
          Doubles makes every double trump. Follow me uses no trump; follow the
          high end of the domino led.
        </small>
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
    return null;
  if (g.phase === "complete")
    return null;
  return null;
}
