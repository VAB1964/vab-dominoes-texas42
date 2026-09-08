import { describe, expect, it } from "vitest";
import { countValue, legalPlays } from "../../worker/src/rules";
import { TUTORIAL_STEPS, tutorialControlsFor } from "./tutorial-content";
import {
  createTutorialState,
  goBack,
  performTutorialAction,
  readTutorialProgress,
  restartTutorial,
  skipStep,
  TUTORIAL_PROGRESS_KEY,
  writeTutorialProgress,
} from "./tutorial-engine";

describe("tutorial engine", () => {
  it("advances only when the expected action is performed", () => {
    const steps = TUTORIAL_STEPS.moon;
    const state = createTutorialState("moon");
    const rejected = performTutorialAction(state, steps, { type: "bid", value: 5 });
    expect(rejected.step).toBe(0);
    expect(rejected.feedback).toBeTruthy();

    const advanced = performTutorialAction(state, steps, { type: "next" });
    expect(advanced.step).toBe(1);
  });

  it("supports back, skip, restart, and completion", () => {
    const steps = TUTORIAL_STEPS.texas42;
    let state = createTutorialState("texas42");
    state = skipStep(state, steps);
    expect(state.step).toBe(1);
    expect(goBack(state).step).toBe(0);
    expect(restartTutorial({ ...state, step: 5 }).step).toBe(0);

    state = { ...state, step: steps.length - 1 };
    state = performTutorialAction(state, steps, steps.at(-1)!.expected);
    expect(state.completed).toBe(true);
  });

  it("saves and restores local progress safely", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const state = { ...createTutorialState("moon"), step: 4 };
    writeTutorialProgress(storage, state);
    expect(readTutorialProgress(storage)).toEqual({
      path: "moon",
      step: 4,
      completed: false,
    });

    values.set(TUTORIAL_PROGRESS_KEY, "{bad json");
    expect(readTutorialProgress(storage)).toBeNull();
  });
});

describe("tutorial content", () => {
  it.each(["moon", "texas42"] as const)(
    "%s has unique, actionable steps and a practice finish",
    (path) => {
      const steps = TUTORIAL_STEPS[path];
      expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length);
      expect(steps.some((step) => step.section === "basics")).toBe(true);
      expect(steps.at(-1)?.section).toBe("practice");

      for (const step of steps) {
        if (step.expected.type === "play") {
          expect(step.scene.hand).toContain(step.expected.value);
        }
        if (
          step.expected.type === "bid" ||
          step.expected.type === "choose-trump" ||
          step.expected.type === "choose-widow"
        ) {
          expect(tutorialControlsFor(step)).toContainEqual(step.expected);
        }
      }
    },
  );

  it("uses legally correct follow-suit and trump examples", () => {
    const moonTrump = TUTORIAL_STEPS.moon.find((step) => step.id === "moon-trump-play")!;
    expect(
      legalPlays(
        moonTrump.scene.hand,
        moonTrump.scene.trick[0]!.domino,
        moonTrump.scene.trump!,
      ),
    ).toContain("4-4");

    const texasCount = TUTORIAL_STEPS.texas42.find(
      (step) => step.id === "texas42-practice-count",
    )!;
    expect(
      legalPlays(
        texasCount.scene.hand,
        texasCount.scene.trick[0]!.domino,
        texasCount.scene.trump!,
      ),
    ).toContain("6-4");
    expect(countValue("6-4")).toBe(10);
    expect(countValue("5-5")).toBe(10);
  });
});
