import type {
  EventEnvelope,
  GameType,
  PresentationSync,
  RoomView,
  ServerMessage,
} from "./types";

export class RoomClient {
  ws: WebSocket | null = null;
  revision = 0;
  playerId: string | null = null;
  private stopped = false;
  private retry: number | null = null;
  private name = "";
  private create = false;
  private gameType: GameType = "moon";
  private lastSeq = 0;
  private waitingForResyncSnapshot = false;

  constructor(
    private code: string,
    private update: (
      view: RoomView | null,
      error?: string,
      event?: EventEnvelope,
      presentationSync?: PresentationSync,
    ) => void,
  ) {}

  connect(name: string, create: boolean, gameType: GameType = "moon") {
    this.name = name;
    this.create = create;
    this.gameType = gameType;
    this.stopped = false;
    this.open();
  }

  private open() {
    if (this.stopped) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const token = localStorage.getItem(`moon.${this.code}.token`) || undefined;
    this.ws = new WebSocket(`${scheme}://${location.host}/api/dominoes/rooms/${this.code}/ws`);
    this.ws.onopen = () =>
      this.sendRaw(this.create && !token ? "CREATE_ROOM" : "JOIN_ROOM", {
        name: this.name,
        gameType: this.gameType,
        reconnectToken: token,
      });
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMessage;
      if (msg.type === "ERROR") {
        this.update(null, msg.error.message);
        return;
      }
      if (msg.type === "WELCOME") {
        this.playerId = msg.playerId;
        this.lastSeq = msg.seq;
        this.waitingForResyncSnapshot = false;
        if (msg.reconnectToken) localStorage.setItem(`moon.${this.code}.token`, msg.reconnectToken);
        this.revision = msg.snapshot.revision;
        this.update(msg.snapshot, undefined, undefined, {
          seq: msg.seq,
          snapshot: msg.snapshot,
          reason: "welcome",
        });
        return;
      }
      if (msg.type === "SNAPSHOT") {
        const isResync = this.waitingForResyncSnapshot;
        if (this.waitingForResyncSnapshot) {
          this.lastSeq = msg.seq;
          this.waitingForResyncSnapshot = false;
        }
        this.revision = msg.snapshot.revision;
        this.update(
          msg.snapshot,
          undefined,
          undefined,
          isResync
            ? { seq: msg.seq, snapshot: msg.snapshot, reason: "resync" }
            : undefined,
        );
        return;
      }
      if (msg.type === "EVENT") {
        if (msg.seq <= this.lastSeq) return;
        if (msg.seq > this.lastSeq + 1) {
          if (!this.waitingForResyncSnapshot) {
            this.waitingForResyncSnapshot = true;
            this.sendRaw("REQUEST_SNAPSHOT");
          }
          return;
        }
        this.lastSeq = msg.seq;
        this.update(null, undefined, {
          seq: msg.seq,
          serverTs: msg.serverTs,
          event: msg.event,
          protocol: msg.protocol,
        });
      }
    };
    this.ws.onerror = () => this.update(null, "The table connection was interrupted.");
    this.ws.onclose = () => {
      if (this.stopped) return;
      this.update(null, "Reconnecting to the table…");
      this.retry = window.setTimeout(() => this.open(), 750);
    };
  }

  private sendRaw(type: string, payload: unknown = {}) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.update(null, "The table is reconnecting. Please try again in a moment.");
      return false;
    }
    this.ws.send(
      JSON.stringify({ type, payload, expectedRevision: this.revision, playerId: this.playerId }),
    );
    return true;
  }

  send(type: string, payload: unknown = {}) {
    return this.sendRaw(type, payload);
  }

  close() {
    this.stopped = true;
    if (this.retry !== null) window.clearTimeout(this.retry);
    this.waitingForResyncSnapshot = false;
    this.ws?.close();
  }
}
