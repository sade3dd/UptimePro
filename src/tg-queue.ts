import { DurableObject } from "cloudflare:workers";
import auth, { UNAUTH_ROUTES } from "./auth";

export class MonitorEngine extends DurableObject {
  state: DurableObjectState;
  env: any;

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  // ====================== 初始化表 ======================
  async initTable() {
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS monitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        method TEXT DEFAULT 'GET',
        headers TEXT,
        body TEXT,
        body_type TEXT DEFAULT 'none', -- none, json, form, raw
        interval INTEGER DEFAULT 60,
        notify INTEGER DEFAULT 1, -- 0: 禁用, 1: 启用
        status TEXT DEFAULT 'unknown',
        last_check DATETIME,
        next_check DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id INTEGER,
        status_code INTEGER,
        latency INTEGER,
        success INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    await this.initTable();

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // API: 获取监控项
    if (url.pathname === "/api/monitors" && request.method === "GET") {
      const cursor = this.state.storage.sql.exec("SELECT * FROM monitors ORDER BY created_at DESC");
      return Response.json(cursor.toArray(), { headers: corsHeaders });
    }

    // API: 添加监控项 (立即执行)
    if (url.pathname === "/api/monitors" && request.method === "POST") {
      const body = await request.json() as any;
      this.state.storage.sql.exec(
        "INSERT INTO monitors (name, url, method, headers, body, body_type, interval, notify, next_check, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        body.name, body.url, body.method || 'GET',
        body.headers ? JSON.stringify(body.headers) : null,
        body.body || null,
        body.body_type || 'none',
        body.interval || 60,
        body.notify === false ? 0 : 1,
        new Date().toISOString(),
        new Date().toISOString()
      );
      await this.state.storage.setAlarm(Date.now());
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // API: 修改监控项
    if (url.pathname.startsWith("/api/monitors/") && request.method === "PUT") {
      const id = url.pathname.split("/").pop();
      const body = await request.json() as any;
      this.state.storage.sql.exec(
        "UPDATE monitors SET name = ?, url = ?, method = ?, headers = ?, body = ?, body_type = ?, interval = ?, notify = ? WHERE id = ?",
        body.name, body.url, body.method || 'GET',
        body.headers ? JSON.stringify(body.headers) : null,
        body.body || null,
        body.body_type || 'none',
        body.interval || 60,
        body.notify === false ? 0 : 1,
        id
      );
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // API: 删除监控项
    if (url.pathname.startsWith("/api/monitors/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      this.state.storage.sql.exec("DELETE FROM monitors WHERE id = ?", id);
      this.state.storage.sql.exec("DELETE FROM logs WHERE monitor_id = ?", id);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // API: 测试 TG 通知
    if (url.pathname === "/api/test-notify" && request.method === "POST") {
      const testMonitor = {
        name: "Test Monitor",
        url: "https://example.com"
      };
      await this.sendNotification(testMonitor, "down", 500, "This is a test notification from Uptime Pro.");
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // API: 获取日志 (用于状态图)
    if (url.pathname.startsWith("/api/logs/") && request.method === "GET") {
      const id = url.pathname.split("/").pop();
      const cursor = this.state.storage.sql.exec(
        "SELECT * FROM logs WHERE monitor_id = ? ORDER BY timestamp DESC LIMIT 60",
        id
      );
      return Response.json(cursor.toArray(), { headers: corsHeaders });
    }

    if (url.pathname === "/trigger") {
      if (!(await this.state.storage.getAlarm())) {
        await this.state.storage.setAlarm(Date.now());
      }
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  }

  /**
   * ====================== 优化后的 Alarm 处理队列 ======================
   */
  async alarm() {
    const now = new Date().toISOString();

    // 0. 定期清理旧日志 (保留最近 7 天)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    this.state.storage.sql.exec("DELETE FROM logs WHERE timestamp < ?", sevenDaysAgo);

    // 1. 仅选择到期的任务，且每次限制 5 个并发，防止超时
    const cursor = this.state.storage.sql.exec(
      "SELECT * FROM monitors WHERE next_check <= ? LIMIT 5",
      now
    );
    const dueMonitors = cursor.toArray();

    if (dueMonitors.length > 0) {
      console.log(`[MonitorEngine] 正在处理 ${dueMonitors.length} 个到期任务...`);

      // 2. 并发执行
      await Promise.allSettled(dueMonitors.map((m: any) => this.checkSite(m)));

      // 3. 链式调用：检查是否还有剩余到期任务
      const remainingRow = this.state.storage.sql.exec(
        "SELECT count(*) as count FROM monitors WHERE next_check <= ?",
        now
      ).toArray()[0];

      // 修复：显式转换为 Number
      const remaining = remainingRow ? Number(remainingRow.count) : 0;

      if (remaining > 0) {
        console.log(`[MonitorEngine] 还有 ${remaining} 个任务等待处理，1秒后继续...`);
        await this.state.storage.setAlarm(Date.now() + 1000); // 1秒后再次触发，实现连续执行
        return;
      }
    }

    // 4. 如果没有到期任务，寻找最近的一个任务时间并设定闹钟
    const nextTask = this.state.storage.sql.exec(
      "SELECT next_check FROM monitors ORDER BY next_check ASC LIMIT 1"
    ).toArray()[0];

    if (nextTask && nextTask.next_check) {
      // 修复：将 next_check 断言为 string，因为 SQLite 的 DATETIME 返回的是字符串
      const nextTime = new Date(nextTask.next_check as string).getTime();
      const delay = Math.max(1000, nextTime - Date.now());
      console.log(`[MonitorEngine] 无即时任务，下次任务在 ${delay / 1000}s 后`);
      await this.state.storage.setAlarm(Date.now() + delay);
    } else {
      // 彻底没任务，1分钟后醒来检查一次（保活）
      await this.state.storage.setAlarm(Date.now() + 60000);
    }
  }

  async checkSite(monitor: any) {
    let success = false;
    const start = Date.now();
    let statusCode = 0;
    let errorMessage = "";

    try {
      console.log(`[Monitor] 开始检查 ${monitor.url}`);

      // ============================
      // 1. 安全过滤 Header
      // ============================
      function sanitizeHeaders(input: any) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(input || {})) {
          if (/^[A-Za-z0-9-]+$/.test(k)) {
            out[k] = String(v);
          } else {
            console.warn(`[Monitor] Illegal header removed: ${k}`);
          }
        }
        return out;
      }

      // ============================
      // 2. 随机真实浏览器 UA
      // ============================
      const REAL_BROWSER_UA = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/124.0.0.0 Safari/537.36"
      ];

      function randomUA() {
        return REAL_BROWSER_UA[Math.floor(Math.random() * REAL_BROWSER_UA.length)];
      }

      // ============================
      // 3. 自动补安全 Header
      // ============================
      function applySafeDefaults(headers: Record<string, string>, url: string) {
        const safe = { ...headers };

        // 0. 自动补全 Host
        if (!safe["Host"]) {
          try {
            safe["Host"] = new URL(url).host;
          } catch (e) {
            // URL 解析失败
          }
        }

        // 1. 基础浏览器标识
        if (!safe["User-Agent"]) safe["User-Agent"] = randomUA();
        if (!safe["Accept"]) {
          safe["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
        }
        if (!safe["Accept-Language"]) safe["Accept-Language"] = "en-US,en;q=0.9";
        if (!safe["Accept-Encoding"]) safe["Accept-Encoding"] = "gzip, deflate, br, zstd";

        // 2. 强制不缓存 (确保探测的是实时状态)
        if (!safe["Cache-Control"]) safe["Cache-Control"] = "no-cache";
        if (!safe["Pragma"]) safe["Pragma"] = "no-cache";

        // 3. 现代浏览器安全头 (Sec-Fetch 系列)
        // 模拟直接在地址栏输入 URL 的行为 (navigate)
        if (!safe["Sec-Fetch-Dest"]) safe["Sec-Fetch-Dest"] = "document";
        if (!safe["Sec-Fetch-Mode"]) safe["Sec-Fetch-Mode"] = "navigate";
        if (!safe["Sec-Fetch-Site"]) safe["Sec-Fetch-Site"] = "none";
        if (!safe["Sec-Fetch-User"]) safe["Sec-Fetch-User"] = "?1";
        if (!safe["Upgrade-Insecure-Requests"]) safe["Upgrade-Insecure-Requests"] = "1";

        // 4. 自动补全 Referer (可选，模拟同站跳转)
        if (!safe["Referer"]) {
          try {
            const origin = new URL(url).origin;
            safe["Referer"] = origin + "/";
          } catch (e) {
            // URL 解析失败则不补
          }
        }

        return safe;
      }

      // ============================
      // 4. 解析 + 过滤 + 默认头
      // ============================
      let headers: Record<string, string> = {};

      if (monitor.headers) {
        try {
          const parsed = JSON.parse(monitor.headers);
          if (parsed && typeof parsed === "object") {
            headers = sanitizeHeaders(parsed);
          }
        } catch (e) {
          console.error("[Monitor] Headers parse error:", e);
        }
      }

      headers = applySafeDefaults(headers, monitor.url);

      // ============================
      // 5. 构造 fetchOptions
      // ============================
      const fetchOptions: any = {
        method: monitor.method || "GET",
        headers,
        signal: AbortSignal.timeout(25000),
      };

      // ============================
      // 5.1 处理 Body（POST/PUT/PATCH）
      // ============================
      if (monitor.body && ["POST", "PUT", "PATCH"].includes(monitor.method)) {
        let bodyData = monitor.body;
        const bodyType = monitor.body_type || 'none';

        if (bodyType === 'json') {
          if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
          try {
            // 如果是对象则序列化，否则原样（可能是已经序列化的字符串）
            const parsed = typeof monitor.body === 'string' ? JSON.parse(monitor.body) : monitor.body;
            bodyData = JSON.stringify(parsed);
          } catch (e) {
            bodyData = monitor.body;
          }
        } else if (bodyType === 'form') {
          if (!headers["Content-Type"]) headers["Content-Type"] = "application/x-www-form-urlencoded";
          try {
            const parsed = typeof monitor.body === 'string' ? JSON.parse(monitor.body) : monitor.body;
            bodyData = new URLSearchParams(parsed).toString();
          } catch (e) {
            bodyData = monitor.body;
          }
        } else if (bodyType === 'raw') {
          // raw 模式下，如果不手动设置 Content-Type，默认 text/plain
          if (!headers["Content-Type"]) headers["Content-Type"] = "text/plain";
          bodyData = monitor.body;
        }

        fetchOptions.body = bodyData;
      }


      // ============================
      // 6. 执行请求
      // ============================
      const res = await fetch(monitor.url, fetchOptions);
      statusCode = res.status;
      const latency = Date.now() - start;
      success = res.ok;

      if (!success) {
        const text = await res.text().catch(() => "");
        errorMessage = `HTTP ${statusCode}`;
        console.log(`[Monitor] ${monitor.url} - ${statusCode} (${latency}ms) ${text} - FAIL`);
      } else {
        console.log(`[Monitor] ${monitor.url} - ${statusCode} (${latency}ms) - OK`);
      }

    } catch (e: any) {
      success = false;
      errorMessage = e.message || "Timeout/Network Error";
      console.error(`[Monitor] ${monitor.url} - ERROR: ${errorMessage}`);
    }

    // ============================
    // 7. 更新数据库 + 写入日志
    // ============================
    const latency = Date.now() - start;
    const newStatus = success ? "up" : "down";
    const nextCheck = new Date(Date.now() + monitor.interval * 1000).toISOString();

    this.state.storage.sql.exec(
      "UPDATE monitors SET status = ?, last_check = ?, next_check = ? WHERE id = ?",
      newStatus, new Date().toISOString(), nextCheck, monitor.id
    );

    this.state.storage.sql.exec(
      "INSERT INTO logs (monitor_id, status_code, latency, success) VALUES (?, ?, ?, ?)",
      monitor.id, statusCode, latency, success ? 1 : 0
    );

    // ============================
    // 8. 状态变更通知
    // ============================
    if (monitor.status !== "unknown" && monitor.status !== newStatus && monitor.notify === 1) {
      this.sendNotification(monitor, newStatus, statusCode, errorMessage).catch(e => {
        console.error("[MonitorEngine] 通知发送失败:", e);
      });
    }
  }



  async sendNotification(monitor: any, status: string, code: number, error: string) {
    const token = this.env.TG_BOT_TOKEN;
    const chatId = this.env.TG_CHAT_ID;

    if (!token || !chatId) return;

    const icon = status === "up" ? "✅" : "❌";
    const statusText = status === "up" ? "恢复正常 (UP)" : "检测到故障 (DOWN)";

    // 安全的时间格式化
    let time = "";
    try {
      time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    } catch (e) {
      time = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
    }

    const message = `${icon} *监控状态变更通知*\n\n` +
      `*名称*: ${monitor.name}\n` +
      `*地址*: ${monitor.url}\n` +
      `*状态*: ${statusText}\n` +
      `*详情*: ${status === "up" ? "服务已恢复" : error}\n` +
      `*时间*: ${time}`;

    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown"
        })
      });
    } catch (e) {
      console.error("[MonitorEngine] 发送 TG 通知失败:", e);
    }
  }

  // ====================== KV 操作接口 (用于 Auth) ======================
  async kvGet(key: string) {
    return await this.state.storage.get(key);
  }

  async kvPut(key: string, value: any) {
    await this.state.storage.put(key, value);
  }

  async kvDelete(key: string) {
    await this.state.storage.delete(key);
  }
}
