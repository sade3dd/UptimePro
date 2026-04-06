import { DurableObject } from "cloudflare:workers";

export class WSSEngine extends DurableObject {
  private sessions = new Set<WebSocket>();

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // 0. 安全验证
    const secureKey = (this.env as any).SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi";
    if (request.headers.get("X-Intferfnal-Calla") !== secureKey) {
      return new Response("Forbidden", { status: 403 });
    }

    // 1. 处理 WebSocket 升级
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      this.sessions.add(server);

      server.addEventListener("message", (msg) => {
        const trimmed = typeof msg.data === 'string' ? msg.data.trim() : '';
        if (trimmed === 'ping') {
          server.send('pong');
        }
      });

      server.addEventListener("close", () => {
        this.sessions.delete(server);
      });

      server.addEventListener("error", () => {
        this.sessions.delete(server);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // 2. 处理来自 MonitorEngine 的广播请求
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const data = await request.json();
      this.broadcast(data);
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  }

  private broadcast(data: any) {
    const message = JSON.stringify(data);
    this.sessions.forEach(ws => {
      try {
        if (ws.readyState === 1) {
          ws.send(message);
        } else {
          this.sessions.delete(ws);
        }
      } catch (e) {
        this.sessions.delete(ws);
      }
    });
  }
}
