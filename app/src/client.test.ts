import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomClient } from "./client";

class FakeWebSocket {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    sockets.push(this);
  }

  send(body: string) {
    this.sent.push(body);
  }

  close() {}

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const sockets: FakeWebSocket[] = [];
const snapshot = {
  revision: 1,
  game: { phase: "playing", handId: 1, trickId: 1, trick: [] },
};

afterEach(() => {
  sockets.length = 0;
  vi.unstubAllGlobals();
});

describe("RoomClient presentation synchronization", () => {
  it("syncs presentation on welcome but not routine snapshots", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("location", { protocol: "http:", host: "example.test" });
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    const update = vi.fn();
    const client = new RoomClient("ABC234", update);

    client.connect("Vince", false);
    const ws = sockets[0];
    ws.receive({
      type: "WELCOME",
      protocol: "v2",
      playerId: "p1",
      reconnectToken: null,
      snapshot,
      seq: 4,
    });
    expect(update.mock.calls[0][3]).toMatchObject({ reason: "welcome", seq: 4 });

    ws.receive({ type: "SNAPSHOT", protocol: "v2", snapshot, seq: 4 });
    expect(update.mock.calls[1][3]).toBeUndefined();
  });

  it("uses a requested resync snapshot as a new presentation boundary", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.stubGlobal("location", { protocol: "http:", host: "example.test" });
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => null), setItem: vi.fn() });
    const update = vi.fn();
    const client = new RoomClient("ABC234", update);

    client.connect("Vince", false);
    const ws = sockets[0];
    ws.receive({
      type: "WELCOME",
      protocol: "v2",
      playerId: "p1",
      reconnectToken: null,
      snapshot,
      seq: 4,
    });
    ws.receive({
      type: "EVENT",
      protocol: "v2",
      seq: 6,
      serverTs: 1,
      event: { type: "HAND_COMPLETED", handId: 1, phase: "hand-end", message: "Done" },
    });
    expect(JSON.parse(ws.sent.at(-1)!).type).toBe("REQUEST_SNAPSHOT");

    ws.receive({ type: "SNAPSHOT", protocol: "v2", snapshot, seq: 6 });
    expect(update.mock.calls.at(-1)?.[3]).toMatchObject({ reason: "resync", seq: 6 });
  });
});
