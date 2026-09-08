import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function nextMessage(ws: WebSocket, timeout = 2000) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket response timed out")), timeout);
    ws.addEventListener(
      "message",
      (event) => {
        clearTimeout(timer);
        resolve(JSON.parse(String(event.data)));
      },
      { once: true },
    );
  });
}

async function nextSnapshot(ws: WebSocket, timeout = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const msg = await nextMessage(ws, timeout);
    if (msg.type === "SNAPSHOT" || msg.type === "WELCOME") return msg;
  }
  throw new Error("Snapshot response timed out");
}

async function nextEvent(ws: WebSocket, timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const msg = await nextMessage(ws, timeout);
    if (msg.type === "EVENT") return msg;
  }
  throw new Error("Event response timed out");
}

describe("browser WebSocket commands", () => {
  it("accepts a human bid after AI players act", async () => {
    const roomResponse = await SELF.fetch("https://example.com/api/dominoes/rooms", {
      method: "POST",
    });
    const { roomId } = (await roomResponse.json()) as { roomId: string };
    const response = await SELF.fetch(`https://example.com/api/dominoes/rooms/${roomId}/ws`, {
      headers: { Upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
    const ws = response.webSocket!;
    ws.accept();
    await nextMessage(ws); // CONNECTED
    ws.send(
      JSON.stringify({
        type: "CREATE_ROOM",
        payload: { name: "Vince", gameType: "moon" },
        expectedRevision: 0,
        playerId: null,
      }),
    );
    const created = await nextSnapshot(ws);
    const playerId = created.playerId as string;
    let revision = created.snapshot.revision as number;
    for (const seat of [1, 2]) {
      ws.send(
        JSON.stringify({
          type: "ADD_AI",
          payload: { seat, difficulty: "medium" },
          expectedRevision: revision,
          playerId,
        }),
      );
      const msg = await nextSnapshot(ws);
      revision = msg.snapshot.revision;
    }

    ws.send(JSON.stringify({ type: "SET_READY", payload: { ready: true }, expectedRevision: revision, playerId }));
    revision = (await nextSnapshot(ws)).snapshot.revision;
    ws.send(JSON.stringify({ type: "START_GAME", payload: {}, expectedRevision: revision, playerId }));
    let state = await nextSnapshot(ws);
    for (let guard = 0; guard < 5 && state.snapshot?.game.turnSeat !== 0; guard++) {
      state = await nextSnapshot(ws);
    }
    expect(state.snapshot.game).toMatchObject({ phase: "bidding", turnSeat: 0 });
    revision = state.snapshot.revision;

    ws.send(JSON.stringify({ type: "BID", payload: { bid: 5 }, expectedRevision: revision, playerId }));
    let afterBid = await nextSnapshot(ws);
    expect(afterBid.error).toBeUndefined();
    expect(afterBid.snapshot.game.highBid).toBe(5);
    for (let guard = 0; guard < 5 && afterBid.snapshot?.game.phase !== "widow"; guard++) {
      afterBid = await nextSnapshot(ws);
    }
    expect(afterBid.snapshot.game).toMatchObject({ phase: "widow", bidderSeat: 0, turnSeat: 0 });
    expect(afterBid.snapshot.game.hand).toHaveLength(8);
    revision = afterBid.snapshot.revision;

    ws.send(
      JSON.stringify({
        type: "DISCARD",
        payload: { domino: afterBid.snapshot.game.hand[0] },
        expectedRevision: revision,
        playerId,
      }),
    );
    const afterDiscard = await nextSnapshot(ws);
    expect(afterDiscard.error).toBeUndefined();
    expect(afterDiscard.snapshot.game).toMatchObject({ phase: "trump", bidderSeat: 0, turnSeat: 0 });
    expect(afterDiscard.snapshot.game.hand).toHaveLength(7);

    ws.send(JSON.stringify({ type: "CHOOSE_TRUMP", payload: { trump: 6 }, expectedRevision: afterDiscard.snapshot.revision, playerId }));
    let afterTrump = await nextSnapshot(ws);
    for (let guard = 0; guard < 5 && afterTrump.snapshot.game.phase !== "playing"; guard++) {
      afterTrump = await nextSnapshot(ws);
    }
    expect(afterTrump.snapshot.game.phase).toBe("playing");
    const toPlay = afterTrump.snapshot.game.hand[0];
    ws.send(
      JSON.stringify({
        type: "PLAY_DOMINO",
        payload: { domino: toPlay },
        expectedRevision: afterTrump.snapshot.revision,
        playerId,
      }),
    );
    const playEvent = await nextEvent(ws);
    expect(playEvent.protocol).toBe("v2");
    expect(playEvent.event.type).toBe("PLAY_ADDED");
    const firstSeq = playEvent.seq as number;

    let completedEvent = await nextEvent(ws);
    for (let guard = 0; guard < 8 && completedEvent.event.type !== "TRICK_COMPLETED"; guard++) {
      completedEvent = await nextEvent(ws);
    }
    expect(completedEvent.event.type).toBe("TRICK_COMPLETED");
    expect(completedEvent.seq).toBeGreaterThan(firstSeq);
    expect(completedEvent.event.plays).toHaveLength(3);
    const orderedPlayIds = completedEvent.event.plays.map((play: { playId: number }) => play.playId);
    expect(orderedPlayIds).toEqual([...orderedPlayIds].sort((a, b) => a - b));
    ws.close();
  }, 20000);
});
