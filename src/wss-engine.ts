import { DurableObject } from "cloudflare:workers";

export class WSSEngine extends DurableObject {
  // 用于追踪所有活跃的 WebSocket 连接
  private sessions = new Map<WebSocket, { id: string }>();

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
  }

  async fetch(request: Request) {
    // 0. 安全验证：确保请求来自受信任的内部 Worker
    const secureKey = (this.env as any).SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi";
    if (request.headers.get("X-Intferfnal-Calla") !== secureKey) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);

    // 1. 处理 WebSocket 升级
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // 按照官方例子：调用 accept() 接受连接
      server.accept();
      
      // 为会话生成唯一 ID 并存入 Map
      const id = crypto.randomUUID();
      this.sessions.set(server, { id });

      // 绑定消息处理
      server.addEventListener("message", (event) => {
        this.handleWebSocketMessage(server, event.data);
      });

      // 绑定关闭处理
      server.addEventListener("close", () => {
        this.handleConnectionClose(server);
      });

      // 绑定错误处理
      server.addEventListener("error", () => {
        this.handleConnectionClose(server);
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

  async handleWebSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // 仅处理心跳 ping
    const data = typeof message === 'string' ? message.trim() : '';
    if (data === 'ping') {
      ws.send('pong');
    }
  }

  async handleConnectionClose(ws: WebSocket) {
    this.sessions.delete(ws);
    console.log(`[WSS] Session removed. Total active: ${this.sessions.size}`);
  }

  private broadcast(data: any) {
    const message = JSON.stringify(data);
    this.sessions.forEach((_, ws) => {
      try {
        // 仅向处于 OPEN 状态的连接发送
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

