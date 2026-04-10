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

  async fetch(request: Request) {
    const url = new URL(request.url);
    const secureKey = this.env.SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi";

    // 0. 安全验证 (排除 /probe 路径，它在 webSocketMessage 中验证)
    if (url.pathname !== "/probe") {
      if (request.headers.get("X-Intferfnal-Calla") !== secureKey) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // ====================== WebSocket 握手 ======================
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      // ❗❗❗ 关键：必须交给 Durable Object 管理
      this.state.acceptWebSocket(server);
      
      // 记录 IP
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      this.ipMap.set(server, ip);

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

  private ipMap: Map<WebSocket, string> = new Map();

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = JSON.parse(message as string);
      
      if (data.type === 'server_stats') {
        // 转发给 MonitorEngine 处理
        const engineId = this.env.MONITOR_ENGINE.idFromName("global_monitor");
        const engine = this.env.MONITOR_ENGINE.get(engineId);
        
        // 此时已通过握手鉴权，直接转发数据
        await engine.fetch(new Request("http://internal/api/system-stats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Intferfnal-Calla": this.env.SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi"
          },
          body: JSON.stringify(data)
        }));
      }
    } catch (e) {
      // 忽略非 JSON 消息或解析错误
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.ipMap.delete(ws);
  }

  async webSocketError(ws: WebSocket, error: any) {
    this.ipMap.delete(ws);
  }
}
