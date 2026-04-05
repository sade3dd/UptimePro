import { MonitorEngine } from "./tg-queue.js";
import auth, { isAuthenticated, UNAUTH_ROUTES } from "./auth.js";
import NO_HTML_CONTENT from "./template/404.html"
import INDEX_HTML_CONTENT from "./template/index.html"
export interface Env {
  MONITOR_ENGINE: DurableObjectNamespace;
  FIXED_USERNAME?: string;
  FIXED_PASSWORD?: string;
  JWT_SECRET?: string;
  CAPTCHA_SALT?: string;
  SECURE_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const securityHeaders = {
      "Content-Security-Policy":
        "default-src 'self'; " +
        "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; " +
        "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; " +
        "img-src 'self' data: blob:; " +
        "media-src 'self' blob:; " +
        "connect-src 'self' https://cdn.jsdelivr.net; " +
        "object-src 'none';",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    };

    const corsHeaders = {
      "Content-Type": "text/html;charset=UTF-8",
      ...securityHeaders,

    };
    const FIXED_PASSWORD = env.FIXED_PASSWORD || 'password';
    // 密码长度最小值
    const MIN_PASSWORD_LENGTH = 12;

    // 默认密码 或 密码太短 → 阻止访问
    if (
      FIXED_PASSWORD === 'password' ||
      FIXED_PASSWORD.length < MIN_PASSWORD_LENGTH
    ) {
      return new Response(NO_HTML_CONTENT, {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }
    // 处理 Auth 路由 (直接在 Worker 中处理，auth 会使用 DO 进行持久化存储)
    if (Object.values(UNAUTH_ROUTES).includes(url.pathname as any)) {
      return auth.fetch(request, env);
    }

    // 排除内部触发和公开路由
    if (url.pathname !== "/internal/trigger") {
      const jwtSecret = env.JWT_SECRET || 'k1PtweQ69UBRzdOIla2n6AJf9ovp3TvFBhvbeUIOxSmCEPOvQwfRGBuzeaHwKfjNIJb7JtaEruvYkjPUp5eZpZ';
      const authenticated = await isAuthenticated(request, jwtSecret);
      if (!authenticated) {
        // 如果是 API 或 WebSocket 请求，返回 401
        if (url.pathname.startsWith("/api/") || request.headers.get("Upgrade") === "websocket") {
          return new Response("Unauthorized", { status: 401 });
        }
        console.log("未认证请求", url.pathname);
        return Response.redirect(new URL("/login", request.url).toString(), 302);
      }
    }

    const id = env.MONITOR_ENGINE.idFromName("global_monitor");
    const obj = env.MONITOR_ENGINE.get(id);


    // 处理 WebSocket 升级 或 API 请求
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket" || url.pathname.startsWith("/api/")) {
      // 💡 修复：使用 clone() 并在新请求中添加 header，这是转发 WebSocket 最稳妥的方式
      const newRequest = new Request(request);
      newRequest.headers.set("X-Intferfnal-Calla", env.SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi");
      
      return obj.fetch(newRequest);
    }

    if (url.pathname.startsWith("/api/")) {
      return obj.fetch(
        new Request(request, {
          headers: {
            ...request.headers,
            "X-Intferfnal-Calla": env.SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi",
          },
        }),
      );

    }
    if (url.pathname === "/") {
      return new Response(INDEX_HTML_CONTENT, { headers: corsHeaders });
    }

    return Response.redirect(new URL("/login", request.url).toString(), 302);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const id = env.MONITOR_ENGINE.idFromName("global_monitor");
    const obj = env.MONITOR_ENGINE.get(id);
    await obj.fetch(new Request("http://internal/trigger", {
      headers: { "X-Intferfnal-Calla": env.SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi" }
    }));

  }
};

export { MonitorEngine };
