import { DurableObject, env } from "cloudflare:workers";

export class WSSEngine extends DurableObject {
  state: DurableObjectState;
  env: any; 
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;

    // ✅ 官方自动心跳：底层处理 ping/pong，不占 JS
    this.state.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  /**
   * 广播消息给所有已连接的客户端
   * 完全使用 this.state.getWebSockets()
   * 无需自己维护 Set，绝对安全
   */
  broadcast(data: unknown): void {
    const message = typeof data === "string" ? data : JSON.stringify(data);

    // ✅ Cloudflare 自动维护的所有活跃 WebSocket
    for (const ws of this.state.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch {
          // 忽略发送失败的连接
        }
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
     // 0. 安全验证
    const secureKey = (this.env as any).SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi";
    if (request.headers.get("X-Intferfnal-Calla") !== secureKey) {
      return new Response("Forbidden", { status: 403 });
    }

    // 1. 处理 WebSocket 连接
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // 接受连接
      this.state.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // 2. 内部接口：供其他 DO 调用广播
    if (request.method === "POST") {
      try {
        const body = await request.json();
        this.broadcast(body);
        return new Response("ok", { status: 200 });
      } catch {
        return new Response("invalid body", { status: 400 });
      }
    }

    return new Response("Not found", { status: 404 });
  }
}
