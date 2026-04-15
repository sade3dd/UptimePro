import { DurableObject, env } from "cloudflare:workers";
import { connect } from "cloudflare:sockets";
import { encode, decode } from "@msgpack/msgpack";

export class MonitorEngine extends DurableObject {
  state: DurableObjectState;
  env: any;
  private initialized = false;
  private monitors = new Map<string, any>();
  private kvMemory = new Map<string, any>();

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  // ====================== 异步初始化逻辑 ======================
  async initTable() {
    // 防止重复初始化
    if (this.initialized) return;

    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS data_store (
        key TEXT PRIMARY KEY,
        value BLOB
      );
    `);

    const rows = this.state.storage.sql.exec("SELECT key, value FROM data_store").toArray();
    for (const row of rows) {
      const key = row.key as string;
      try {
        const value: any = decode(row.value as ArrayBuffer);
        if (key === 'monitors') {
          this.monitors = new Map(Object.entries(value));
        }
      } catch (e) {
        // 回退逻辑
        try {
          const value = JSON.parse(new TextDecoder().decode(row.value as ArrayBuffer));
          if (key === 'monitors') {
            this.monitors = new Map(Object.entries(value));
          }
        } catch (jsonError) {
          //console.error('Failed to parse stored data:', jsonError);
        }
      }
    }
    this.initialized = true;
    // /console.log(`[DO] Database initialized with ${this.monitors.size} monitors.`);
  }

  async saveToSqlite() {
    const monitorsData = encode(Object.fromEntries(this.monitors));
    this.state.storage.sql.exec("INSERT OR REPLACE INTO data_store (key, value) VALUES ('monitors', ?)", monitorsData);
  }


  private getStats() {
    const allMonitors = Array.from(this.monitors.values());
    const total = allMonitors.length;
    const upCount = allMonitors.filter(m => m.status === 'up').length;
    const downCount = allMonitors.filter(m => m.status === 'down').length;
    const unknownCount = allMonitors.filter(m => m.status === 'unknown').length;
    const totalUptime = allMonitors.reduce((acc, m) => acc + (Number(m.uptime) || 0), 0);
    const avgUptime = total > 0 ? (totalUptime / total).toFixed(2) : '---';
    return { total, upCount, downCount, unknownCount, avgUptime };
  }

  /**
   * 统一记录检查结果并更新可用率
   */
  private updateMonitorUptime(monitorId: string, success: boolean) {
    const monitorData = this.monitors.get(monitorId);
    if (!monitorData) return;

    const now = Date.now();
    const isSuccess = success ? 1 : 0;

    if (!monitorData.history24h) {
      monitorData.history24h = [];
    }

    monitorData.history24h.push({
      success: isSuccess,
      timestamp: now
    });

    // 清理超过24小时的记录
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    monitorData.history24h = monitorData.history24h.filter(
      (log: any) => log.timestamp > twentyFourHoursAgo
    );

    // 计算精确的24小时成功率 (保留两位小数)
    const total24h = monitorData.history24h.length;
    const success24h = monitorData.history24h.filter((log: any) => log.success === 1).length;

    const uptime = total24h > 0
      ? parseFloat(((success24h / total24h) * 100).toFixed(2))
      : 100;

    monitorData.uptime24h = uptime;
    monitorData.uptime = uptime;
    this.monitors.set(monitorId, monitorData);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // 1. 权限校验（最快路径）
    if (request.headers.get("X-Intferfnal-Calla") !== this.env.SECURE_KEY) {
      return new Response("Forbidden", { status: 403 });
    }

    // 3. API 请求处理（API 需要数据，所以必须等待初始化）
    if (!this.initialized) {
      // 这里的 await 是安全的，因为 API 请求不是 WebSocket 握手
      await this.initTable();
    }
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
      ...securityHeaders,
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    // API: 获取监控项 (支持分页)
    if (url.pathname === "/api/monitors" && request.method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "1");
      const pageSize = parseInt(url.searchParams.get("pageSize") || "20");

      const allMonitors = Array.from(this.monitors.values());
      // 按创建时间倒序排序
      // 排序：优先显示系统探针 (type === 'server')，其次按创建时间倒序
      allMonitors.sort((a, b) => {
        if (a.type === 'server' && b.type !== 'server') return -1;
        if (a.type !== 'server' && b.type === 'server') return 1;
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });

      const { total, upCount, downCount, avgUptime } = this.getStats();

      const start = (page - 1) * pageSize;
      const paginatedMonitors = allMonitors.slice(start, start + pageSize).map(monitor => {
        // 创建一个干净的副本，不包含 history24h (后端私有数据)
        const { history24h, ...cleanMonitor } = monitor;
        return cleanMonitor;
      });

      return Response.json({
        monitors: paginatedMonitors,
        total,
        upCount,
        downCount,
        avgUptime,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }, { headers: corsHeaders });
    }

    // API: 添加监控项
    if (url.pathname === "/api/monitors" && request.method === "POST") {
      const body = await request.json() as any;
      // 确保 headers 是 JSON 字符串
      if (body.headers && typeof body.headers === 'object') {
        body.headers = JSON.stringify(body.headers);
      }
      // 规范化 probe_key
      if (body.probe_key) {
        body.probe_key = String(body.probe_key).substring(0, 128);
      }
      // 允许前端传入自定义 ID (例如探针 UUID)
      const id = body.id || crypto.randomUUID();
      
      // 如果 ID 已存在，返回错误 (POST 应该是新建)
      if (this.monitors.has(id)) {
        return Response.json({ error: "Monitor ID already exists" }, { status: 400, headers: corsHeaders });
      }

      const newMonitor = {
        id,
        ...body,
        method: body.method || 'GET',
        type: body.type || 'http',
        interval: body.interval || 60,
        notify: body.notify === false ? 0 : 1,
        status: 'unknown',
        last_check: null,
        next_check: new Date().toISOString(),
        created_at: new Date().toISOString(),
        logs: [],
        history24h: [],     // ← 新增：仅后端用于计算24h uptime，**前端不会返回**
        uptime24h: 100,     // ← 新增
        uptime: 100         // 兼容前端
      };
      this.monitors.set(id, newMonitor);
      await this.saveToSqlite();
      this.state.storage.setAlarm(Date.now() + 1000);
      // 💡 返回新创建的对象，方便前端局部更新
      const { history24h, ...cleanMonitor } = newMonitor;
      // 💡 广播新增监控
      // 3. 计算统计数据并推送当前批次结果
      const { total, upCount, downCount, avgUptime } = this.getStats();
      await this.broadcast({
        type: 'add',
        total,
        upCount,
        downCount,
        avgUptime,
        monitor: cleanMonitor
      });

      return Response.json({ success: true, monitor: cleanMonitor }, { headers: corsHeaders });
    }

    // API: 修改监控项
    if (url.pathname.startsWith("/api/monitors/") && request.method === "PUT") {
      const id = url.pathname.split("/").pop();
      if (id && this.monitors.has(id)) {
        const body = await request.json() as any;
        // 确保 headers 是 JSON 字符串
        if (body.headers && typeof body.headers === 'object') {
          body.headers = JSON.stringify(body.headers);
        }
        // 1. 规范化 notify 字段
        if (body.notify !== undefined) {
          body.notify = body.notify ? 1 : 0;
        }
        
        // 2. 确保 probe_key 被保存
        if (body.probe_key) {
          body.probe_key = String(body.probe_key).substring(0, 128);
        }

        body.next_check = new Date().toISOString();
        const monitor = this.monitors.get(id);
        const updatedMonitor = { ...monitor, ...body };
        this.monitors.set(id, updatedMonitor);
        await this.saveToSqlite();
        this.state.storage.setAlarm(Date.now() + 1000);

        // 💡 返回更新后的对象
        const { history24h, ...cleanMonitor } = updatedMonitor;
        // 💡 广播更新监控
        // 3. 计算统计数据并推送当前批次结果
        const { total, upCount, downCount, avgUptime } = this.getStats();
        await this.broadcast({
          type: 'update',
          total,
          upCount,
          downCount,
          avgUptime,
          monitors: [cleanMonitor]
        });

        return Response.json({ success: true, monitor: cleanMonitor }, { headers: corsHeaders });
      }
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    // API: 删除监控项
    if (url.pathname.startsWith("/api/monitors/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      if (id && this.monitors.has(id)) {
        this.monitors.delete(id);
        await this.saveToSqlite();
        // 💡 广播删除监控
        await this.broadcast({ type: 'delete', id });

        return Response.json({ success: true }, { headers: corsHeaders });
      }
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    // API: 测试 TG 通知
    if (url.pathname.startsWith("/api/test-notify") && request.method === "POST") {
      const id = url.pathname.split("/").pop();
      let testMonitor: any = {
        name: "Test Monitor",
        url: "https://example.com"
      };

      if (id && id !== "test-notify") {
        const m = this.monitors.get(id);
        if (m) testMonitor = m;
      }

      await this.sendNotification(testMonitor, "down", 500, "This is a test notification from Uptime Pro.");
      return Response.json({ success: true, message: 'Test notification sent!' }, { headers: corsHeaders });
    }

    // API: 获取所有日志 (合并获取)
    if (url.pathname === "/api/logs" && request.method === "GET") {
      const allLogs: Record<string, any> = {};
      for (const [id, m] of this.monitors) {
        allLogs[id] = m.logs;
      }
      return Response.json(allLogs, { headers: corsHeaders });
    }

    // API: 获取配置信息 (仅限 Dashboard 使用)
    if (url.pathname === "/api/config" && request.method === "GET") {
      return Response.json({
        probe_key: this.env.PROBE_KEY || this.env.SECURE_KEY || ""
      }, { headers: corsHeaders });
    }

    // API: 处理系统探针数据
    if (url.pathname === "/api/system-stats" && request.method === "POST") {
      const body = await request.json() as any;
      const { id, name, data, key } = body;
      
      // 1. 基础验证与恶意篡改防护
      if (!id) {
        return new Response("Monitor ID is required", { status: 400 });
      }
      if (!data || typeof data !== 'object') {
        return new Response("Invalid data", { status: 400 });
      }

      // 验证数据字段类型并确保数值合理
      const sanitizedData = {
        cpu: Math.min(100, Math.max(0, Number(data.cpu) || 0)),
        load: Array.isArray(data.load) ? data.load.map((l: any) => Number(l) || 0) : [0,0,0],
        mem: {
          total: Math.max(0, Number(data.mem?.total) || 0),
          used: Math.max(0, Number(data.mem?.used) || 0)
        },
        disk: {
          total: Math.max(0, Number(data.disk?.total) || 0),
          used: Math.max(0, Number(data.disk?.used) || 0)
        },
        net: {
          up: Math.max(0, Number(data.net?.up) || 0),
          down: Math.max(0, Number(data.net?.down) || 0),
          total_up: Math.max(0, Number(data.net?.total_up) || 0),
          total_down: Math.max(0, Number(data.net?.total_down) || 0)
        },
        uptime: Math.max(0, Number(data.uptime) || 0),
        timestamp: Date.now()
      };

      // 2. 检查监控项是否存在且类型匹配
      const monitor = this.monitors.get(id);
      if (!monitor) {
        return new Response("Monitor not found. Please add it in the dashboard first.", { status: 404 });
      }
      if (monitor.type !== 'server') {
        return new Response("Monitor type mismatch. This ID belongs to a non-server monitor.", { status: 403 });
      }

      // 2.1 验证密钥 (严格校验，不回退)
      const expectedKey = monitor.probe_key;
      if (!expectedKey || key !== expectedKey) {
        return new Response("Invalid probe key", { status: 401 });
      }

      // 3. 更新数据
      monitor.status = 'up';
      monitor.last_check = new Date().toISOString();
      monitor.server_data = sanitizedData;
      
      // 更新可用率统计
      this.updateMonitorUptime(id, true);
      
      // 3.1 显式更新内存中的 Map (确保引用一致性)
      this.monitors.set(id, monitor);
      
      // 4. 持久化到数据库
      //  await this.saveToSqlite();
      
      // 5. 确保闹钟已开启（用于超时检查）
      const alarmTime = await this.state.storage.getAlarm();
      console.log('alarmTime:', alarmTime);
      if (!alarmTime || alarmTime < Date.now()) {
        await this.state.storage.setAlarm(Date.now() + 30000);
        console.log('Alarm set to:', Date.now() + 30000);
      }
      
      // 广播更新
      const { history24h, ...cleanMonitor } = monitor;
      const { total, upCount, downCount, avgUptime } = this.getStats();
      await this.broadcast({
        type: 'update',
        total,
        upCount,
        downCount,
        avgUptime,
        monitors: [cleanMonitor]
      });

      return new Response("ok");
    }

    // API: 获取单个监控项日志
    if (url.pathname.startsWith("/api/logs/") && request.method === "GET") {
      const id = url.pathname.split("/").pop();
      if (id && this.monitors.has(id)) {
        return Response.json(this.monitors.get(id).logs, { headers: corsHeaders });
      }
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    if (url.pathname === "/trigger") {
      if (!(await this.state.storage.getAlarm())) {
        await this.state.storage.setAlarm(Date.now() + 1000);
      }
      return new Response("OK");
    }

    // API: 内部验证接口 (用于 WebSocket 握手前置校验)
    if (url.pathname === "/internal/verify-probe") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      const ip = url.searchParams.get("ip") || "unknown";

      // 1. 频率限制 (防爆破)
      const now = Date.now();
      if (!this.rateLimits) this.rateLimits = new Map();
      const rl = this.rateLimits.get(ip) || { count: 0, last: 0, blockedUntil: 0 };
      
      if (rl.blockedUntil > now) return new Response("Too Many Requests", { status: 429 });
      
      if (now - rl.last > 60000) {
        rl.count = 1;
      } else {
        rl.count++;
      }
      rl.last = now;

      if (rl.count > 15) { // 1分钟内尝试超过15次则封禁
        rl.blockedUntil = now + 300000; // 封禁5分钟
        this.rateLimits.set(ip, rl);
        return new Response("Rate limit exceeded", { status: 429 });
      }
      this.rateLimits.set(ip, rl);

      // 2. 密钥校验
      if (!id || !key) return new Response("Missing parameters", { status: 400 });
      const monitor = this.monitors.get(id);
      if (!monitor || monitor.type !== 'server') return new Response("Monitor not found", { status: 404 });
      
      if (monitor.probe_key !== key) {
        return new Response("Invalid key", { status: 401 });
      }

      return new Response("ok");
    }

    return new Response("Not Found", { status: 404 });
  }

  private rateLimits: Map<string, any> = new Map();

  /**
   * ====================== 优化后的 Alarm 处理队列 ======================
   */
  async alarm() {
    if (!this.initialized) {
      console.log('初始化数据库');
      await this.initTable();
      await this.state.storage.setAlarm(Date.now() + 3000);
      this.initialized = true;
    } else {
      console.log('数据库已初始化 ');
    }
    const now = Date.now();
    const allMonitors = Array.from(this.monitors.values());

    // 1. 检查服务器探针是否超时 (保留逻辑)
    const serverMonitors = allMonitors.filter(m => m.type === 'server');
    let hasServerStatusChange = false;
    const changedServerMonitors = [];

    for (const m of serverMonitors) {
      if (!m.last_check) {
        // console.log(`[MonitorEngine] Server probe ${m.name} has no last_check yet.`);
        continue;
      }
      const lastCheck = new Date(m.last_check).getTime();
      const diff = now - lastCheck;
      
      // 如果超过 150 秒没收到数据，标记为离线
      if (diff > 150000 && m.status !== 'down') {
        console.log(`[MonitorEngine] Server probe ${m.name} timed out. Diff: ${diff}ms, Status: ${m.status}, Notify: ${m.notify}`);
        m.status = 'down';
        // 记录失败
        this.updateMonitorUptime(m.id, false);
        hasServerStatusChange = true;
        const { history24h, ...cleanMonitor } = m;
        changedServerMonitors.push(cleanMonitor);
        
        if (m.notify) {
          console.log(`[MonitorEngine] Sending TG notification for ${m.name} timeout.`);
          // 使用 waitUntil 确保通知发送完成，即使 alarm 方法已返回
          this.state.waitUntil(this.sendNotification(m, "down", 0, "Probe Timeout (150s)").catch(e => {
            console.error(`[MonitorEngine] TG notification failed for ${m.name}:`, e);
          }));
        } else {
          console.log(`[MonitorEngine] Notification disabled for ${m.name}, skipping TG.`);
        }
      }
    }

    // 2. 仅选择到期的任务，且每次限制 5 个并发，防止超时
    const dueMonitors = allMonitors
      .filter(m => m.type !== 'server' && new Date(m.next_check || 0).getTime() <= now)
      .slice(0, 5);

    if (dueMonitors.length > 0 || hasServerStatusChange) {
      if (dueMonitors.length > 0) {
        console.log(`[MonitorEngine] 正在处理 ${dueMonitors.length} 个到期任务...`);

        // 并发执行（带间隔）
        await Promise.allSettled(dueMonitors.map(async (m: any, index: number) => {
          // 添加间隔，防止 429 错误
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 1200)); // 1.2秒间隔
          }
          return this.checkSite(m);
        }));
      }

      // 3. 计算统计数据并推送当前批次结果
      const stats = this.getStats();
      
      // 合并需要更新的监控项
      const monitorsToUpdate = [
        ...dueMonitors.map(m => {
          const { history24h, ...clean } = m;
          return clean;
        }),
        ...changedServerMonitors
      ];

      this.broadcast({ 
        type: 'update', 
        monitors: monitorsToUpdate,
        ...stats
      });

      // 4. 链式调用：检查是否还有剩余到期任务
      const remaining = Array.from(this.monitors.values())
        .filter(m => m.type !== 'server' && new Date(m.next_check || 0).getTime() <= now).length;

      if (remaining > 0) {
        console.log(`[MonitorEngine] 还有 ${remaining} 个任务等待处理，1秒后继续...`);
        await this.state.storage.setAlarm(Date.now() + 1000);
        return;
      }
      
      // 5. 没有监控任务了，保存到 SQLite
      await this.saveToSqlite();
    }

    // 6. 如果没有到期任务，寻找最近的一个任务时间并设定闹钟
    const nextTask = Array.from(this.monitors.values())
      .filter(m => m.type !== 'server' && new Date(m.next_check || 0).getTime() > now)
      .sort((a, b) => new Date(a.next_check).getTime() - new Date(b.next_check).getTime())[0];

    if (nextTask) {
      const nextTime = new Date(nextTask.next_check).getTime();
      const delay = Math.min(60000, Math.max(10000, nextTime - now)); // 最长60秒
      const nextTimeStr = new Date(now + delay).toLocaleString();
      console.log(`[MonitorEngine] 无即时任务，下次任务在 ${nextTimeStr}`);
      await this.state.storage.setAlarm(now + delay);
    } else {
      // 彻底没任务，30秒后醒来检查一次（保活）
      const nextTimeStr = new Date(now + 30000).toLocaleString();
      console.log(`[MonitorEngine] 无任务，30秒后检查（保活） ${nextTimeStr}`);
      await this.state.storage.setAlarm(now + 30000);
    } 
  }

  async checkSite(monitor: any) {
    if (monitor.type === 'server') return; // 探针监控不参与 fetch 轮询
    if (monitor.type === 'tcp') {
      return this.checkTcp(monitor);
    }

    let success = false;
    const start = Date.now();
    let statusCode = 0;
    let errorMessage = "";
    // 【新增】1. 在检查前记录旧状态
    const oldStatus = monitor.status;

    try {
      console.log(`[Monitor] 开始检查 ${monitor.url}`);

      // ============================
      // 0. 检查是否为 IP 地址 (Workers 不支持直接 IP 监控)
      // ============================
      try {
        const urlObj = new URL(monitor.url);
        const hostname = urlObj.hostname;
        // 简单的 IP 正则 (IPv4)
        if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname.includes(':')) {
          throw new Error("Direct IP monitoring is not supported by Cloudflare Workers. Please use a domain name.");
        }
      } catch (e: any) {
        if (e.message.includes("Direct IP")) throw e;
      }

      // ============================
      // 1. 安全过滤 Header
      // ============================
      function sanitizeHeaders(input: any) {
        const out: Record<string, string> = {};
        for (const [rawKey, v] of Object.entries(input || {})) {
          const k = String(rawKey).toLowerCase();

          // 过滤 HTTP/2 伪头
          if (k.startsWith(":")) continue;

          // 只允许合法 header 名
          if (!/^[a-z0-9-]+$/.test(k)) {
            //console.warn(`[Monitor] Illegal header removed: ${rawKey}`);
            continue;
          }

          out[k] = String(v);
        }
        return out;
      }


      // ============================
      // 3. 自动补安全 Header
      // ============================
      function applySafeDefaults(headers: Record<string, string>, url: string, userAgent: string) {
        const safe = { ...headers };

        const u = new URL(url);
        const host = u.host;

        // 0. Host 自动补全（如果用户没写）
        if (!safe["host"]) safe["host"] = host;

        // 1. 基础浏览器标识
        if (!safe["user-agent"]) safe["user-agent"] = userAgent;
        if (!safe["accept"]) {
          safe["accept"] =
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
        }
        return safe;
      }


      // ============================
      // 4. 解析 + 过滤 + 默认头
      // ============================
      let headers: Record<string, string> = {};

      if (monitor.headers) {
        try {
          let parsed;
          if (typeof monitor.headers === 'string') {
            parsed = JSON.parse(monitor.headers);
          } else if (typeof monitor.headers === 'object' && monitor.headers !== null) {
            parsed = monitor.headers;
          }
          if (parsed && typeof parsed === "object") {
            headers = sanitizeHeaders(parsed);
          }
        } catch (e) {
          //console.error("[Monitor] Headers parse error:", e);
        }
      }

      headers = applySafeDefaults(headers, monitor.url, this.env?.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

      // ============================
      // 5. 构造 fetchOptions
      // ============================
      const fetchOptions: any = {
        method: monitor.method || "GET",
        headers,
        signal: AbortSignal.timeout(25000),
        redirect: "manual",
        cf: {
          cacheTtlByStatus: {
            '100-599': -1,
          }
        }
      };

      // ============================
      // 5.1 处理 Body（POST/PUT/PATCH）
      // ============================
      if (monitor.body && ["POST", "PUT", "PATCH"].includes(monitor.method)) {
        let bodyData = monitor.body;
        const bodyType = monitor.body_type || 'none';

        // 注意：sanitizeHeaders 已经将 key 转为小写，所以这里必须检查小写 'content-type'
        if (bodyType === 'json') {
          if (!headers["content-type"]) {
            headers["content-type"] = "application/json";
          }
          try {
            // 如果是对象则序列化，否则原样（可能是已经序列化的字符串）
            const parsed = typeof monitor.body === 'string' ? JSON.parse(monitor.body) : monitor.body;
            bodyData = JSON.stringify(parsed);
          } catch (e) {
            bodyData = monitor.body;
          }
        } else if (bodyType === 'form') {
          if (!headers["content-type"]) {
            headers["content-type"] = "application/x-www-form-urlencoded";
          }
          try {
            const parsed = typeof monitor.body === 'string' ? JSON.parse(monitor.body) : monitor.body;
            bodyData = new URLSearchParams(parsed).toString();
          } catch (e) {
            bodyData = monitor.body;
          }
        } else if (bodyType === 'raw') {
          // raw 模式下，如果不手动设置 Content-Type，默认 text/plain
          if (!headers["content-type"]) {
            headers["content-type"] = "text/plain";
          }
          bodyData = monitor.body;
        }

        fetchOptions.body = bodyData;
      }

      // ============================
      // 6. 执行请求
      // ============================
      let res = await fetch(
        monitor.url,
        fetchOptions
      );
      // 处理重定向
      let redirectCount = 0;
      const maxRedirects = 3; // 最大重定向次数

      while (res.status >= 300 && res.status < 400 && redirectCount < maxRedirects) {
        const location = res.headers.get('location');
        if (!location) break;

        // 构建完整的重定向 URL
        const redirectUrl = new URL(location, monitor.url).href;
        res = await fetch(redirectUrl, fetchOptions);
        redirectCount++;
      }
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
      //console.error(`[Monitor] ${monitor.url} - ERROR: ${errorMessage}`);
    }

    // ============================
    // 7. 更新内存数据 + 写入日志
    // ============================
    const latency = Date.now() - start;
    const newStatus = success ? "up" : "down";
    const nextCheck = new Date(Date.now() + (monitor.interval || 60) * 1000).toISOString();

    const monitorData = this.monitors.get(monitor.id);
    if (monitorData) {
      monitorData.status = newStatus;
      monitorData.last_check = new Date().toISOString();
      monitorData.next_check = nextCheck;
      monitorData.latency = latency;

      // 添加日志并限制为 60 条
      monitorData.logs.push({
        status_code: statusCode,
        latency,
        success: success ? 1 : 0,
        timestamp: new Date().toISOString()
      });
      if (monitorData.logs.length > 60) {
        monitorData.logs.shift();
      }

      // 更新可用率统计
      this.updateMonitorUptime(monitor.id, success);
      //this.broadcast({ type: 'update', monitor: monitorData });
    }

    // ============================
    // 8. 状态变更通知
    // ============================
    if (oldStatus !== "unknown" && oldStatus !== newStatus && monitor.notify) {
      this.state.waitUntil(this.sendNotification(monitor, newStatus, statusCode, errorMessage).catch(e => {
        console.error("[MonitorEngine] 通知发送失败:", e);
      }));
    }
  }

  async checkTcp(monitor: any) {
    let success = false;
    const start = Date.now();
    let errorMessage = "";
    let socket: any = null;
    // 【新增】1. 在检查前记录旧状态
    const oldStatus = monitor.status;
    try {
      console.log(`[Monitor] 开始 TCP 检查 ${monitor.url}`);

      let host = "";
      let port = 0;

      if (monitor.url.includes(":")) {
        const parts = monitor.url.replace("tcp://", "").split(":");
        host = parts[0];
        port = parseInt(parts[1]);
      } else {
        host = monitor.url.replace("tcp://", "");
        port = 80;
      }

      if (!host || isNaN(port)) {
        throw new Error("Invalid TCP address format. Use host:port");
      }

      socket = connect({ hostname: host, port: port });

      // 等待连接建立
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TCP Connection Timeout")), 15000)
      );

      await Promise.race([socket.opened, timeoutPromise]);

      success = true;
      console.log(`[Monitor] TCP ${host}:${port} - OK`);
    } catch (e: any) {
      success = false;
      errorMessage = e.message || "TCP Connection Error";
      //console.error(`[Monitor] TCP ${monitor.url} - ERROR: ${errorMessage}`);
    } finally {
      if (socket) {
        socket.close().catch(() => { });
      }
    }

    // ============================
    // 更新内存数据 + 写入日志
    // ============================
    const latency = Date.now() - start;
    const newStatus = success ? "up" : "down";
    const nextCheck = new Date(Date.now() + (monitor.interval || 60) * 1000).toISOString();

    const monitorData = this.monitors.get(monitor.id);
    if (monitorData) {
      monitorData.status = newStatus;
      monitorData.last_check = new Date().toISOString();
      monitorData.next_check = nextCheck;
      monitorData.latency = latency;

      // 添加日志并限制为 60 条
      monitorData.logs.push({
        status_code: success ? 200 : 0,
        latency,
        success: success ? 1 : 0,
        timestamp: new Date().toISOString()
      });
      if (monitorData.logs.length > 60) {
        monitorData.logs.shift();
      }

      // 更新可用率统计
      this.updateMonitorUptime(monitor.id, success);
      this.monitors.set(monitor.id, monitorData);
      //this.broadcast({ type: 'update', monitor: monitorData });
    }

    // ============================
    // 状态变更通知
    // ============================
    if (oldStatus !== "unknown" && oldStatus !== newStatus && monitor.notify) {
      this.state.waitUntil(this.sendNotification(monitor, newStatus, success ? 200 : 0, errorMessage).catch(e => {
        console.error("[MonitorEngine] 通知发送失败:", e);
      }));
    }
  }



async sendNotification(monitor: any, status: string, code: number, error: string) {
  const token = this.env.TG_BOT_TOKEN;
  const chatId = this.env.TG_CHAT_ID;

  if (!token || !chatId) {
    console.error("[MonitorEngine] 通知失败: 环境变量 TG_BOT_TOKEN 或 TG_CHAT_ID 未配置");
    return;
  }

  const icon = status === "up" ? "✅" : "❌";
  const statusText = status === "up" ? "恢复正常 (UP)" : "检测到故障 (DOWN)";
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 使用 HTML 模式比 Markdown 更不容易因为特殊字符（如 _ *）报错
  const message = `
<b>${icon} 监控状态变更通知</b>

<b>名称</b>: ${monitor.name}
<b>地址</b>: ${monitor.url}
<b>状态</b>: ${statusText}
<b>详情</b>: ${status === "up" ? "服务已恢复" : (error || "未知错误")}
<b>时间</b>: ${time}
  `.trim();

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000); // 增加到15秒

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML" // 推荐使用 HTML 模式，更健壮
      }),
      signal: controller.signal
    });

    clearTimeout(id);

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`[MonitorEngine] TG API 报错: ${resp.status} - ${errorText}`);
    } else {
      console.log(`[MonitorEngine] 通知发送成功: ${monitor.name}`);
    }
  } catch (e: any) {
    clearTimeout(id);
    console.error(`[MonitorEngine] 发送异常 (网络/超时): ${e.message}`);
  }
}
  // ====================== KV 操作接口 (用于 Auth) ======================
  // ====================== KV 操作接口 (用于 Auth) ======================
  async kvGet(key: string) {
    const value = this.kvMemory.get(key);
    return value;
  }

  async kvPut(key: string, value: any) {
    this.kvMemory.set(key, value);
  }

  async kvDelete(key: string) {
    this.kvMemory.delete(key);
  }

  // ====================== WebSocket 处理 ======================
  private async broadcast(data: any) {
    const wssId = this.env.WS_ENGINE.idFromName("global_wss");
    const wssObj = this.env.WS_ENGINE.get(wssId);
    await wssObj.fetch(new Request("http://internal/broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Intferfnal-Calla": this.env.SECURE_KEY || "IsC3jy5A1axaCxX3I8mP8fE7sjfHiKGQe1Mi"
      },
      body: JSON.stringify(data)
    })).catch(() => { });

  }
}
