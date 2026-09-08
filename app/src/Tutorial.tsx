import { useEffect, useMemo, useState } from "react";
import { Domino } from "./domino";
import { HiddenHand, PlayerCard } from "./table-components";
import {
  actionLabel,
  TUTORIAL_STEPS,
  tutorialControlsFor,
} from "./tutorial-content";
import {
  createTutorialState,
  goBack,
  performTutorialAction,
  readTutorialProgress,
  restartTutorial,
  skipStep,
  writeTutorialProgress,
  type TutorialAction,
  type TutorialPath,
  type TutorialProgress,
  type TutorialState,
} from "./tutorial-engine";

export function Tutorial({
  onExit,
  playPlayerTone,
}: {
  onExit: () => void;
  playPlayerTone: (seat: number) => void;
}) {
  const [saved, setSaved] = useState<TutorialProgress | null>(() =>
    readTutorialProgress(localStorage),
  );
  const [state, setState] = useState<TutorialState | null>(null);
  const steps = state ? TUTORIAL_STEPS[state.path] : null;

  useEffect(() => {
    if (!state) return;
    writeTutorialProgress(localStorage, state);
    setSaved({ path: state.path, step: state.step, completed: state.completed });
  }, [state]);

  const begin = (path: TutorialPath, resume = true) => {
    setState(createTutorialState(path, resume ? saved : null));
  };

  if (!state || !steps) {
    return (
      <main className="entry-shell tutorial-chooser">
        <section className="entry-card">
          <span className="eyebrow">Interactive lessons</span>
          <h1>Learn Dominoes</h1>
          <p>Practice on a guided table. No room, opponents, or player name required.</p>
          {saved && !saved.completed && (
            <button className="primary tutorial-resume" onClick={() => begin(saved.path)}>
              Resume {saved.path === "moon" ? "Moon" : "Texas 42"} · step {saved.step + 1}
            </button>
          )}
          <div className="game-picks">
            <button onClick={() => begin("moon", false)}>
              <strong>Learn Moon</strong>
              <span>Three players · widow · individual contracts</span>
            </button>
            <button onClick={() => begin("texas42", false)}>
              <strong>Learn Texas 42</strong>
              <span>Four players · partners · count dominoes</span>
            </button>
          </div>
          <button onClick={onExit}>Back to game setup</button>
        </section>
      </main>
    );
  }

  if (state.completed) {
    const other: TutorialPath = state.path === "moon" ? "texas42" : "moon";
    return (
      <main className="entry-shell tutorial-complete">
        <section className="entry-card">
          <span className="eyebrow">Lesson complete</span>
          <h1>{state.path === "moon" ? "Moon" : "Texas 42"} ready</h1>
          <p>You completed the guided lesson and practice hand.</p>
          <div className="actions">
            <button onClick={() => setState(restartTutorial(state))}>Replay lesson</button>
            <button onClick={() => begin(other, false)}>
              Learn {other === "moon" ? "Moon" : "Texas 42"}
            </button>
            <button className="primary" onClick={onExit}>Play a real game</button>
          </div>
        </section>
      </main>
    );
  }

  const step = steps[state.step]!;
  const scene = step.scene;
  const submit = (action: TutorialAction) => {
    if (
      action.type === "play" &&
      step.expected.type === "play" &&
      action.value === step.expected.value
    ) {
      playPlayerTone(0);
    }
    setState((current) =>
      current ? performTutorialAction(current, steps, action) : current,
    );
  };
  const controls = tutorialControlsFor(step);
  const progress = Math.round(((state.step + 1) / steps.length) * 100);
  const playerAt = (seat: number) => scene.players.find((player) => player.seat === seat);
  const cardPlayer = (seat: number) => {
    const player = playerAt(seat);
    return player
      ? { ...player, score: 0, tricks: 0, isAI: seat !== 0 }
      : undefined;
  };

  return (
    <main className="game-shell tutorial-shell">
      <header className="game-header">
        <strong><span>Learn</span> {state.path === "moon" ? "Moon" : "Texas 42"}</strong>
        <div>{state.step + 1} of {steps.length}</div>
        <button onClick={onExit}>Exit tutorial</button>
      </header>
      <div className="tutorial-progress" aria-label={`${progress}% complete`}>
        <i style={{ width: `${progress}%` }} />
      </div>
      <div className={`status ${step.callout === "status" || step.callout === "score" ? "tutorial-focus" : ""}`}>
        <span>Bid <b>{scene.bid}</b></span>
        <span>Trump <b>{scene.trump ?? "Not chosen"}</b></span>
        <span>Score <b>{scene.score}</b></span>
      </div>
      <section className={`table ${state.path} ${step.callout === "players" ? "tutorial-focus" : ""}`}>
        <PlayerCard p={cardPlayer(1)} pos="west" active={scene.turnSeat === 1} />
        <PlayerCard p={cardPlayer(2)} pos="north" active={scene.turnSeat === 2} />
        {state.path === "texas42" && (
          <PlayerCard p={cardPlayer(3)} pos="east" active={scene.turnSeat === 3} />
        )}
        <HiddenHand count={playerAt(1)?.dominoCount ?? 0} pos="west" seat={1} active={scene.turnSeat === 1} />
        <HiddenHand count={playerAt(2)?.dominoCount ?? 0} pos="north" seat={2} active={scene.turnSeat === 2} />
        {state.path === "texas42" && (
          <HiddenHand count={playerAt(3)?.dominoCount ?? 0} pos="east" seat={3} active={scene.turnSeat === 3} />
        )}
        <div className={`trick ${step.callout === "trick" ? "tutorial-focus" : ""}`}>
          {scene.trick.map((play, index) => (
            <div
              className={`trick-play no-entry player-color-${play.seat}`}
              key={`${play.seat}-${play.domino}-${index}`}
            >
              <Domino value={play.domino} />
            </div>
          ))}
        </div>
        <div className="message">{scene.message}</div>
      </section>
      <section className={`hand player-color-0 ${step.callout === "hand" ? "tutorial-focus" : ""}`}>
        <div><strong>Your practice hand</strong><span>{scene.hand.length} dominoes</span></div>
        <div className="hand-dominoes">
          {scene.hand.map((domino) => (
            <Domino
              key={domino}
              value={domino}
              legal={step.expected.type === "play" && step.expected.value === domino}
              onClick={() => submit({ type: "play", value: domino })}
            />
          ))}
        </div>
      </section>
      {controls.length > 0 && (
        <section className={`decision tutorial-controls ${step.callout === "controls" ? "tutorial-focus" : ""}`}>
          <strong>Make your choice</strong>
          <div>
            {controls.map((action) => (
              <button
                className={actionsEqual(action, step.expected) ? "primary" : ""}
                key={actionLabel(action)}
                onClick={() => submit(action)}
              >
                {actionLabel(action)}
              </button>
            ))}
          </div>
        </section>
      )}
      <CoachCard
        state={state}
        step={step}
        onAction={submit}
        onBack={() => setState(goBack(state))}
        onSkip={() => setState(skipStep(state, steps))}
        onRestart={() => setState(restartTutorial(state))}
      />
    </main>
  );
}

function CoachCard({
  state,
  step,
  onAction,
  onBack,
  onSkip,
  onRestart,
}: {
  state: TutorialState;
  step: (typeof TUTORIAL_STEPS)["moon"][number];
  onAction: (action: TutorialAction) => void;
  onBack: () => void;
  onSkip: () => void;
  onRestart: () => void;
}) {
  return (
    <aside className="tutorial-coach" aria-live="polite">
      <span className="eyebrow">{step.section === "basics" ? "Shared basics" : step.section}</span>
      <h2>{step.title}</h2>
      <p>{step.body}</p>
      <strong>{step.instruction}</strong>
      {state.feedback && <p className="tutorial-feedback">{state.feedback}</p>}
      <div className="tutorial-nav">
        <button disabled={state.step === 0} onClick={onBack}>Back</button>
        <button onClick={onSkip}>Skip</button>
        <button onClick={onRestart}>Restart</button>
        {step.expected.type === "next" && (
          <button className="primary" onClick={() => onAction({ type: "next" })}>Continue</button>
        )}
      </div>
    </aside>
  );
}

function actionsEqual(a: TutorialAction, b: TutorialAction) {
  return a.type === b.type && ("value" in a ? "value" in b && a.value === b.value : true);
}
