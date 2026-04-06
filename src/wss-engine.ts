import { DurableObject } from "cloudflare:workers";

export class WSSEngine extends DurableObject {
  state: DurableObjectState;
  env: any;

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.state = state;
    this.env = env;

    // 自动心跳 ping/pong
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  broadcast(data: any) {
    const msg = JSON.stringify(data);

    for (const ws of this.state.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(msg); } catch {}
      }
    }
  }

  async fetch(request: Request) {
    // 0. 安全验证
    const secureKey = this.env.SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi";
    if (request.headers.get("X-Intferfnal-Calla") !== secureKey) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);

    // ====================== WebSocket 握手 ======================
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      // ❗❗❗ 关键：必须交给 Durable Object 管理
      this.state.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    // ====================== 内部广播接口 ======================
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const body = await request.json();
      this.broadcast(body);
      return new Response("ok", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  }
}
