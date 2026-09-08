import type { Domino, GameType, Trump } from "./types";

export type TutorialPath = GameType;
export type TutorialCallout = "players" | "status" | "trick" | "hand" | "controls" | "score";
export type TutorialAction =
  | { type: "next" }
  | { type: "bid"; value: number | "pass" }
  | { type: "choose-trump"; value: Trump }
  | { type: "choose-widow"; value: "take" | "keep" }
  | { type: "play"; value: Domino };

export interface TutorialPlayer {
  name: string;
  seat: number;
  team?: number;
  dominoCount: number;
}

export interface TutorialScene {
  hand: Domino[];
  trick: { seat: number; domino: Domino }[];
  players: TutorialPlayer[];
  turnSeat: number | null;
  trump: Trump | null;
  bid: string;
  message: string;
  score: string;
}

export interface TutorialStep {
  id: string;
  section: "basics" | "moon" | "texas42" | "practice";
  title: string;
  body: string;
  instruction: string;
  callout: TutorialCallout;
  scene: TutorialScene;
  expected: TutorialAction;
  wrong: string;
  success?: string;
}

export interface TutorialState {
  path: TutorialPath;
  step: number;
  feedback: string;
  completed: boolean;
}

export interface TutorialProgress {
  path: TutorialPath;
  step: number;
  completed: boolean;
}

export const TUTORIAL_PROGRESS_KEY = "dominoes.tutorial.progress.v1";

export function createTutorialState(
  path: TutorialPath,
  progress?: TutorialProgress | null,
): TutorialState {
  const resumed = progress?.path === path && !progress.completed;
  return {
    path,
    step: resumed ? Math.max(0, progress.step) : 0,
    feedback: "",
    completed: false,
  };
}

export function performTutorialAction(
  state: TutorialState,
  steps: TutorialStep[],
  action: TutorialAction,
): TutorialState {
  if (state.completed) return state;
  const current = steps[state.step];
  if (!current) return { ...state, completed: true };
  if (!actionsMatch(current.expected, action)) {
    return { ...state, feedback: current.wrong };
  }
  const nextStep = state.step + 1;
  return {
    ...state,
    step: nextStep,
    feedback: current.success ?? "Correct.",
    completed: nextStep >= steps.length,
  };
}

export function goBack(state: TutorialState): TutorialState {
  return {
    ...state,
    step: Math.max(0, state.step - 1),
    feedback: "",
    completed: false,
  };
}

export function skipStep(state: TutorialState, steps: TutorialStep[]): TutorialState {
  const nextStep = Math.min(steps.length, state.step + 1);
  return { ...state, step: nextStep, feedback: "", completed: nextStep >= steps.length };
}

export function restartTutorial(state: TutorialState): TutorialState {
  return { ...state, step: 0, feedback: "", completed: false };
}

export function readTutorialProgress(storage: Pick<Storage, "getItem">): TutorialProgress | null {
  try {
    const raw = storage.getItem(TUTORIAL_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>;
    if (
      (parsed.path !== "moon" && parsed.path !== "texas42") ||
      typeof parsed.step !== "number" ||
      typeof parsed.completed !== "boolean"
    ) {
      return null;
    }
    return { path: parsed.path, step: Math.max(0, parsed.step), completed: parsed.completed };
  } catch {
    return null;
  }
}

export function writeTutorialProgress(
  storage: Pick<Storage, "setItem">,
  state: TutorialState,
) {
  storage.setItem(
    TUTORIAL_PROGRESS_KEY,
    JSON.stringify({ path: state.path, step: state.step, completed: state.completed }),
  );
}

function actionsMatch(expected: TutorialAction, actual: TutorialAction) {
  return expected.type === actual.type && "value" in expected
    ? "value" in actual && expected.value === actual.value
    : expected.type === actual.type;
}
