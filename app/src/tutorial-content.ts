import type { Domino, GameType, Trump } from "./types";
import type {
  TutorialAction,
  TutorialCallout,
  TutorialPlayer,
  TutorialScene,
  TutorialStep,
} from "./tutorial-engine";

const moonPlayers: TutorialPlayer[] = [
  { name: "You", seat: 0, dominoCount: 7 },
  { name: "Arthur", seat: 1, dominoCount: 7 },
  { name: "Clara", seat: 2, dominoCount: 7 },
];
const texasPlayers: TutorialPlayer[] = [
  { name: "You", seat: 0, team: 0, dominoCount: 7 },
  { name: "Arthur", seat: 1, team: 1, dominoCount: 7 },
  { name: "Clara", seat: 2, team: 0, dominoCount: 7 },
  { name: "Diego", seat: 3, team: 1, dominoCount: 7 },
];

function scene(
  gameType: GameType,
  patch: Partial<TutorialScene> = {},
): TutorialScene {
  return {
    players: gameType === "moon" ? moonPlayers : texasPlayers,
    hand: ["6-6", "6-4", "5-3", "4-4", "3-2", "2-1", "1-1"],
    trick: [],
    turnSeat: 0,
    trump: null,
    bid: "Open",
    message: "Follow the coach card.",
    score: gameType === "moon" ? "You: 0 points" : "Team 1: 0 marks · Team 2: 0 marks",
    ...patch,
  };
}

function step(
  gameType: GameType,
  id: string,
  section: TutorialStep["section"],
  title: string,
  body: string,
  instruction: string,
  callout: TutorialCallout,
  expected: TutorialAction,
  patch: Partial<TutorialScene> = {},
  wrong = "Try the highlighted choice. The coach card will remain here.",
): TutorialStep {
  return {
    id: `${gameType}-${id}`,
    section,
    title,
    body,
    instruction,
    callout,
    expected,
    scene: scene(gameType, patch),
    wrong,
  };
}

function shared(gameType: GameType): TutorialStep[] {
  return [
    step(
      gameType,
      "welcome",
      "basics",
      "Welcome to the table",
      "Dominoes are played in tricks. Every player contributes one domino, and one player wins the trick.",
      "Select Continue to meet the table.",
      "players",
      { type: "next" },
    ),
    step(
      gameType,
      "colors",
      "basics",
      "Players have a color and note",
      "Red, blue, green, and purple frames identify who played each domino. Each player also has a matching musical note.",
      "Continue when you can identify your red seat.",
      "players",
      { type: "next" },
    ),
    step(
      gameType,
      "ends",
      "basics",
      "Read both ends",
      "A 6-4 can follow either sixes or fours, but when it leads, its higher end establishes the six suit. Doubles, such as 4-4, show the same number twice.",
      "Select the 6-4 domino.",
      "hand",
      { type: "play", value: "6-4" },
      {},
      "Choose the domino with six pips on one end and four on the other.",
    ),
    step(
      gameType,
      "follow",
      "basics",
      "Follow the led suit",
      "The 5-2 led the trick, so you must play a five when your hand contains one.",
      "Play 5-3.",
      "hand",
      { type: "play", value: "5-3" },
      {
        hand: ["5-3", "4-4", "3-2", "2-1"],
        trick: [{ seat: 1, domino: "5-2" }],
        turnSeat: 0,
        message: "Fives were led.",
      },
      "You have a five, so another suit is not legal.",
    ),
    step(
      gameType,
      "trick-winner",
      "basics",
      "Highest legal domino wins",
      "Without trump, the strongest domino in the led suit wins. A double is the strongest member of its suit.",
      "Continue after finding the winning 5-5.",
      "trick",
      { type: "next" },
      {
        trick: [
          { seat: 0, domino: "5-3" },
          { seat: 1, domino: "5-5" },
          { seat: 2, domino: "5-2" },
        ],
        turnSeat: null,
        message: "Arthur's 5-5 wins.",
      },
    ),
  ];
}

const moonSteps: TutorialStep[] = [
  ...shared("moon"),
  step(
    "moon",
    "bidding",
    "moon",
    "Bid for your own contract",
    "Moon has three individual players. The high bidder names trump and must capture enough tricks to make the bid.",
    "Bid 5 tricks.",
    "controls",
    { type: "bid", value: 5 },
    { bid: "4 — Clara", message: "You may bid higher or pass." },
  ),
  step(
    "moon",
    "widow",
    "moon",
    "Use the widow",
    "The high bidder takes the extra domino, then discards back to seven. Some rooms allow keeping the original hand.",
    "Take the widow.",
    "controls",
    { type: "choose-widow", value: "take" },
    { bid: "5 — You", message: "Choose whether to use the widow." },
  ),
  step(
    "moon",
    "trump",
    "moon",
    "Choose trump",
    "A numbered trump pulls every domino containing that number into the trump suit. Rooms may also allow doubles or follow-me.",
    "Choose fours as trump.",
    "controls",
    { type: "choose-trump", value: 4 },
    { bid: "5 — You", message: "Choose the suit that strengthens your hand." },
  ),
  step(
    "moon",
    "trump-play",
    "practice",
    "Practice: use trump",
    "Sixes were led, but you have no six. Your 4-4 is the strongest four trump.",
    "Play 4-4.",
    "hand",
    { type: "play", value: "4-4" },
    {
      hand: ["5-3", "4-4", "3-2", "2-1"],
      trick: [{ seat: 2, domino: "6-5" }],
      trump: 4,
      message: "No sixes in your hand: you may trump.",
    },
    "Because you cannot follow sixes, choose the strongest trump.",
  ),
  step(
    "moon",
    "scoring",
    "practice",
    "Practice complete",
    "Make your bid to gain points; miss it and the contract counts against you. Shoot the Moon is the highest-risk contract.",
    "Finish the Moon lesson.",
    "score",
    { type: "next" },
    { trump: 4, bid: "5 — You", score: "You made 5 · Score +5", message: "Contract made." },
  ),
];

const texas42Steps: TutorialStep[] = [
  ...shared("texas42"),
  step(
    "texas42",
    "partners",
    "texas42",
    "Partners sit across",
    "You and Clara are Team 1. Arthur and Diego are Team 2. Either partner may win points for the team. Partners do not discuss hands or coach bids; private signals and prearranged bid meanings are not allowed.",
    "Continue after locating your partner across the table.",
    "players",
    { type: "next" },
  ),
  step(
    "texas42",
    "count",
    "texas42",
    "Count dominoes matter",
    "5-0, 4-1, and 3-2 count five points. 5-5 and 6-4 count ten. Seven trick points plus 35 count points make 42.",
    "Select the ten-count 6-4.",
    "hand",
    { type: "play", value: "6-4" },
    {},
    "Select 6-4. Its ends total ten, so it is worth ten count points.",
  ),
  step(
    "texas42",
    "bid",
    "texas42",
    "Bid team points",
    "A normal bid promises 30 through 42 points. Bids above 42 risk additional marks.",
    "Bid 30.",
    "controls",
    { type: "bid", value: 30 },
    { bid: "Open", message: "You open the auction." },
  ),
  step(
    "texas42",
    "mark-bid",
    "texas42",
    "Bid multiple marks",
    "The 2 marks button is an 84 bid. Your team must capture all 42 points. If you succeed, your team earns two marks. If you miss even one point, the opposing team earns two marks.",
    "Bid 2 marks.",
    "controls",
    { type: "bid", value: 84 },
    { bid: "42 — Diego", message: "Point bidding has reached 42." },
  ),
  step(
    "texas42",
    "doubles-trump",
    "texas42",
    "Doubles can be trump",
    "Choosing Doubles creates a trump suit containing every double. When doubles are led, a player holding a double must follow with one.",
    "Choose Doubles.",
    "controls",
    { type: "choose-trump", value: "doubles" },
    { bid: "30 — You", message: "Compare the specialty trump choices." },
  ),
  step(
    "texas42",
    "follow-me",
    "texas42",
    "Follow me means no trump",
    "Follow me creates no trump suit. The higher end of the first domino establishes the led suit, and only that suit can win the trick.",
    "Choose Follow me.",
    "controls",
    { type: "choose-trump", value: "follow-me" },
    { bid: "30 — You", message: "Choose the no-trump option." },
  ),
  step(
    "texas42",
    "trump",
    "texas42",
    "Name the team trump",
    "Trump works like Moon, but your choice supports a partnership contract.",
    "Choose sixes as trump.",
    "controls",
    { type: "choose-trump", value: 6 },
    { bid: "30 — You", message: "Choose trump for Team 1." },
  ),
  step(
    "texas42",
    "practice-count",
    "practice",
    "Practice: capture count",
    "Sixes are trump. Playing 6-4 wins this trick and captures 21 points: ten from 6-4, ten from 5-5, and one for the trick.",
    "Play 6-4.",
    "hand",
    { type: "play", value: "6-4" },
    {
      hand: ["6-4", "4-4", "3-2", "2-1"],
      trick: [{ seat: 3, domino: "5-5" }],
      trump: 6,
      bid: "30 — You",
      message: "You cannot follow fives, so trump is legal.",
    },
    "Use the 6-4 trump to capture this 21-point trick.",
  ),
  step(
    "texas42",
    "marks",
    "practice",
    "Practice complete",
    "Make a 30–42 contract to earn one mark. Higher contracts can earn or lose multiple marks.",
    "Finish the Texas 42 lesson.",
    "score",
    { type: "next" },
    {
      trump: 6,
      bid: "30 — You",
      score: "Team 1 made 32 · +1 mark",
      message: "Your partnership made its contract.",
    },
  ),
];

export const TUTORIAL_STEPS: Record<GameType, TutorialStep[]> = {
  moon: moonSteps,
  texas42: texas42Steps,
};

export function tutorialControlsFor(step: TutorialStep): TutorialAction[] {
  if (step.expected.type === "bid") {
    return step.scene.players.length === 3
      ? [3, 4, 5, 6, 7].map((value) => ({ type: "bid", value }))
      : [30, 31, 32, 33, 34, 35, 36, 84].map((value) => ({ type: "bid", value }));
  }
  if (step.expected.type === "choose-trump") {
    return ([0, 1, 2, 3, 4, 5, 6, "doubles", "follow-me"] as Trump[]).map(
      (value) => ({ type: "choose-trump", value }),
    );
  }
  if (step.expected.type === "choose-widow") {
    return [
      { type: "choose-widow", value: "take" },
      { type: "choose-widow", value: "keep" },
    ];
  }
  return [];
}

export function actionLabel(action: TutorialAction) {
  if (action.type === "bid") {
    if (action.value === "pass") return "Pass";
    return action.value > 42 ? `${action.value / 42} marks` : String(action.value);
  }
  if (action.type === "choose-trump") {
    return action.value === "doubles"
      ? "Doubles"
      : action.value === "follow-me"
        ? "Follow me"
        : String(action.value);
  }
  if (action.type === "choose-widow") return action.value === "take" ? "Take widow" : "Keep hand";
  return action.type === "next" ? "Continue" : action.value;
}
