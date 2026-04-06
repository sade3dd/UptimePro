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
    // ⭐ 服务器端主动心跳：定期发送 ping 给所有连接
    // Cloudflare 官方推荐方式，保持连接活跃
    this.state.storage.setAlarm(Date.now() + 10000); // 10秒后触发心跳
  }

  broadcast(data: any) {
    const connections = this.state.getWebSockets();
    const msg = JSON.stringify({
      connections: connections.length,  // 添加当前连接数
      ...data            // 原始数据
    });

    for (const ws of this.state.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(msg); } catch { }
      }
    }
  }
  async alarm() {
    const connections = this.state.getWebSockets();
    console.log(`[WSSEngine] Server heartbeat: pinging ${connections.length} connections`);

    // 向所有连接发送服务器端心跳
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send("ping");
        } catch (e) {
          console.error(`[WSSEngine] Failed to send heartbeat to connection:`, e);
        }
      }
    }

    // 设置下一次心跳（10秒后）
    this.state.storage.setAlarm(Date.now() + 10000); // 10秒后触发心跳
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
