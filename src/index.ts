import { MonitorEngine } from "./tg-queue";
import auth, { isAuthenticated, getLoginHtml, UNAUTH_ROUTES } from "./auth";

export interface Env {
  MONITOR_ENGINE: DurableObjectNamespace;
  FIXED_USERNAME?: string;
  FIXED_PASSWORD?: string;
  JWT_SECRET?: string;
  CAPTCHA_SALT?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 处理 Auth 路由 (直接在 Worker 中处理，auth 会使用 DO 进行持久化存储)
    if (Object.values(UNAUTH_ROUTES).includes(url.pathname as any)) {
      return auth.fetch(request, env);
    }

    // 排除内部触发和公开路由
    if (url.pathname !== "/internal/trigger") {
      const authenticated = await isAuthenticated(request, env);
      if (!authenticated) {
        return Response.redirect(new URL("/login", request.url).toString(), 302);
      }
    }

    const id = env.MONITOR_ENGINE.idFromName("global_monitor");
    const obj = env.MONITOR_ENGINE.get(id);

    if (url.pathname.startsWith("/api/")) {
      return await obj.fetch(request);
    }

    return new Response(`
<!DOCTYPE html>
<html lang="zh" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Uptime Pro | 边缘监控面板</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { 
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
            background-color: #000; 
            color: #e4e4e7;
        }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .glass { 
            background: rgba(255, 255, 255, 0.02); 
            backdrop-filter: blur(20px); 
            border: 1px solid rgba(255, 255, 255, 0.05); 
            border-radius: 1.5rem;
        }
        .card-stat {
            padding: 2rem;
            transition: transform 0.3s ease;
        }
        .card-stat:hover {
            transform: translateY(-5px);
        }
        .monitor-card {
            padding: 2rem;
            margin-bottom: 2rem;
            border-radius: 2rem;
        }
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
        }
        .status-up { background-color: #10b981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.5); }
        .status-down { background-color: #ef4444; box-shadow: 0 0 15px rgba(239, 68, 68, 0.5); }
        
        .uptime-bar { display: flex; gap: 2px; height: 30px; }
        .uptime-dot { 
            flex: 1; 
            border-radius: 3px; 
            transition: all 0.2s ease; 
        }
        .uptime-dot:hover { transform: scaleY(1.2); filter: brightness(1.3); }
        
        .sparkline { stroke: #10b981; stroke-width: 2; fill: rgba(16, 185, 129, 0.1); }
        
        .btn-emerald {
            background-color: #10b981;
            color: white;
            border: none;
            font-weight: 800;
            padding: 0.8rem 1.5rem;
            border-radius: 1rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .btn-emerald:hover { background-color: #059669; color: white; }
        
        .modal-content {
            background-color: #09090b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 2rem;
        }
        .form-control, .form-select {
            background-color: #111 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            color: #fff !important;
            border-radius: 1rem;
            padding: 0.75rem 1rem;
        }
        .form-control:focus, .form-select:focus {
            border-color: #10b981 !important;
            box-shadow: 0 0 0 0.25rem rgba(16, 185, 129, 0.25);
        }
        
        /* 滚动条美化 */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; }
        
        .brand { font-weight: 900; letter-spacing: -0.05em; font-size: 2rem; color: #f8fafc; }
        .brand span { color: #10b981; }
        #engineStatusText { color: #60a5fa !important; }
        .text-secondary { color: #94a3b8 !important; }
        .card-stat .h1 { color: #ffffff; }
        #upCount { color: #34d399 !important; }
        #downCount { color: #f87171 !important; }
        #operationalLabel { color: #10b981 !important; }
        #downLabel { color: #ef4444 !important; }
        #uptimeLabel { color: #60a5fa !important; }
        .form-label { color: #c084fc !important; }
        .monitor-card h4 { color: #ffffff; }
        .monitor-card .latency-label { color: #a1a1aa !important; }
        .monitor-card .latency-value { color: #fbbf24 !important; }
        .monitor-card .checks-label { color: #c084fc !important; }
        .monitor-card .stable-label { color: #34d399 !important; }
        .monitor-card .check-label { color: #71717a !important; }
        .monitor-card .check-value { color: #e2e8f0 !important; }
        .hover-emerald:hover { color: #10b981 !important; }
    </style>
</head>
<body>
    <div class="container py-5" style="max-width: 1000px;">
        <header class="d-flex justify-content-between align-items-center mb-5">
            <div>
                <div class="brand">UPTIME<span>PRO</span></div>
                <div class="d-flex align-items-center gap-2">
                    <span class="status-dot status-up" style="width: 8px; height: 8px; animation: pulse 2s infinite;"></span>
                    <span class="text-secondary small fw-bold text-uppercase tracking-wider" id="engineStatusText">Edge Monitoring Engine</span>
                </div>
            </div>
            <div class="d-flex align-items-center gap-3">
                <button onclick="app.testNotify()" class="btn btn-link text-info text-decoration-none small fw-bold text-uppercase tracking-wider p-0 me-3" id="testNotifyBtn">Test Notify</button>
                <button onclick="app.logout()" class="btn btn-link text-danger text-decoration-none small fw-bold text-uppercase tracking-wider p-0 me-3">Logout</button>
                <button onclick="app.toggleLang()" class="btn btn-outline-warning rounded-pill px-5 py-3 fw-bold" id="langBtn">ENGLISH</button>
                <button class="btn btn-emerald rounded-pill px-5 py-3" data-bs-toggle="modal" data-bs-target="#addMonitorModal" id="deployBtn">Deploy Monitor</button>
            </div>
        </header>

        <!-- 概览卡片 -->
        <div class="row g-4 mb-5">
            <div class="col-md-4">
                <div class="glass card-stat">
                    <div class="text-secondary small fw-bold text-uppercase tracking-wider mb-2" id="operationalLabel">Operational</div>
                    <div class="h1 fw-black mb-0" id="upCount">0</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="glass card-stat">
                    <div class="text-secondary small fw-bold text-uppercase tracking-wider mb-2" id="downLabel">Down</div>
                    <div class="h1 fw-black mb-0" id="downCount">0</div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="glass card-stat">
                    <div class="text-secondary small fw-bold text-uppercase tracking-wider mb-2" id="uptimeLabel">Avg Uptime</div>
                    <div class="h1 fw-black mb-0">99.9<span class="fs-4 text-secondary">%</span></div>
                </div>
            </div>
        </div>

        <!-- 监控列表 -->
        <div id="monitorList" class="space-y-4">
            <!-- 动态加载 -->
        </div>
    </div>

    <!-- 添加弹窗 -->
    <div class="modal fade" id="addMonitorModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content p-4">
                <div class="modal-header border-0">
                    <h5 class="modal-title h2 fw-black tracking-tighter" id="modalTitle">New Monitor</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <form id="addMonitorForm">
                        <input type="hidden" id="m_id">
                        <div class="row g-3 mb-4">
                            <div class="col-md-8">
                                <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelName">Monitor Name</label>
                                <input type="text" id="m_name" class="form-control" placeholder="Production API" required>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelMethod">HTTP Method</label>
                                <select id="m_method" class="form-select">
                                    <option value="GET">GET</option>
                                    <option value="POST">POST</option>
                                    <option value="PUT">PUT</option>
                                    <option value="DELETE">DELETE</option>
                                </select>
                            </div>
                        </div>
                        <div class="mb-4">
                            <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelUrl">Target Endpoint</label>
                            <input type="url" id="m_url" class="form-control mono" placeholder="https://api.example.com/v1" required>
                        </div>
                        <div class="mb-4">
                            <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelHeaders">Custom Headers (JSON)</label>
                            <textarea id="m_headers" class="form-control mono" rows="2" placeholder='{"Authorization": "Bearer token"}'></textarea>
                        </div>
                        <div class="mb-4 d-none" id="bodyContainer">
                            <div class="row g-3 mb-3">
                                <div class="col-md-12">
                                    <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelBodyType">Request Body Type</label>
                                    <select id="m_body_type" class="form-select">
                                        <option value="none" id="optNone">None</option>
                                        <option value="json" id="optJson">JSON (application/json)</option>
                                        <option value="form" id="optForm">Form (application/x-www-form-urlencoded)</option>
                                        <option value="raw" id="optRaw">Raw (text/plain)</option>
                                    </select>
                                </div>
                            </div>
                            <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelBody">Request Payload (JSON/Text)</label>
                            <textarea id="m_body" class="form-control mono" rows="3" placeholder='{"key": "value"}'></textarea>
                        </div>
                        <div class="row g-3 mb-4 align-items-end">
                            <div class="col-md-6">
                                <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelInterval">Check Interval</label>
                                <select id="m_interval" class="form-select">
                                    <option value="60" id="opt1m">Every 1 Minute</option>
                                    <option value="300" id="opt5m">Every 5 Minutes</option>
                                    <option value="3600" id="opt1h">Every 1 Hour</option>
                                </select>
                            </div>
                            <div class="col-md-6">
                                <div class="form-check form-switch ms-2 mb-2">
                                    <input class="form-check-input" type="checkbox" id="m_notify" checked>
                                    <label class="form-check-label small fw-bold text-secondary text-uppercase tracking-wider ms-2" for="m_notify">Telegram <span id="notifyText">Notify</span></label>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="modal-footer border-0 gap-3">
                    <button type="button" class="btn btn-link text-secondary text-decoration-none fw-bold text-uppercase tracking-wider" data-bs-dismiss="modal" id="cancelBtn">Cancel</button>
                    <button type="button" onclick="app.addMonitor()" class="btn btn-emerald rounded-pill px-5" id="initBtn">Initialize</button>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script>
        const i18n = {
            en: {
                engine_status: 'Edge Monitoring Engine',
                deploy_btn: 'Deploy Monitor',
                operational: 'Operational',
                down: 'Down',
                avg_uptime: 'Avg Uptime',
                latency: 'Latency',
                last_checks: 'Last 60 Checks',
                stable: 'Stable Connection',
                last_check: 'Last Check',
                next_check: 'Next Check',
                interval: 'Interval',
                new_monitor: 'New Monitor',
                label_name: 'Monitor Name',
                placeholder_name: 'Production API',
                label_method: 'HTTP Method',
                label_url: 'Target Endpoint',
                label_headers: 'Custom Headers (JSON)',
                label_body: 'Request Payload (JSON)',
                label_interval: 'Check Interval',
                every_1m: 'Every 1 Minute',
                every_5m: 'Every 5 Minutes',
                every_1h: 'Every 1 Hour',
                notify: 'Notify',
                logout: 'Logout',
                cancel: 'Cancel',
                initialize: 'Initialize',
                edit_monitor: 'Edit Monitor',
                clone_monitor: 'Clone Monitor',
                test_notify: 'Test Notify',
                label_body_type: 'Request Body Type',
                opt_none: 'None',
                opt_json: 'JSON (application/json)',
                opt_form: 'Form (application/x-www-form-urlencoded)',
                opt_raw: 'Raw (text/plain)'
            },
            cn: {
                engine_status: '边缘监控引擎',
                deploy_btn: '部署监控',
                operational: '正常运行',
                down: '检测到故障',
                avg_uptime: '平均可用率',
                latency: '延迟',
                last_checks: '最近 60 次检查',
                stable: '连接稳定',
                last_check: '上次检查',
                next_check: '下次检查',
                interval: '频率',
                new_monitor: '新建监控',
                label_name: '监控名称',
                placeholder_name: '生产环境 API',
                label_method: 'HTTP 方法',
                label_url: '目标地址',
                label_headers: '自定义请求头 (JSON)',
                label_body: '请求体 (JSON/Text)',
                label_interval: '检查频率',
                every_1m: '每 1 分钟',
                every_5m: '每 5 分钟',
                every_1h: '每 1 小时',
                notify: '推送通知',
                logout: '退出登录',
                cancel: '取消',
                initialize: '立即初始化',
                edit_monitor: '编辑监控',
                clone_monitor: '克隆监控',
                test_notify: '测试通知',
                label_body_type: '请求体类型',
                opt_none: '无',
                opt_json: 'JSON (application/json)',
                opt_form: '表单 (application/x-www-form-urlencoded)',
                opt_raw: '原始数据 (text/plain)'
            }
        };

        const app = {
            monitors: [],
            logs: {},
            lang: localStorage.getItem('lang') || 'en',
            
            t(key) {
                return i18n[this.lang][key] || key;
            },

            updateI18n() {
                document.getElementById('engineStatusText').textContent = this.t('engine_status');
                document.getElementById('deployBtn').textContent = this.t('deploy_btn');
                document.getElementById('operationalLabel').textContent = this.t('operational');
                document.getElementById('downLabel').textContent = this.t('down');
                document.getElementById('uptimeLabel').textContent = this.t('avg_uptime');
                document.getElementById('langBtn').textContent = this.lang === 'en' ? '中文' : 'ENGLISH';
                document.getElementById('testNotifyBtn').textContent = this.t('test_notify');
                document.getElementById('modalTitle').textContent = this.t('new_monitor');
                document.getElementById('labelName').textContent = this.t('label_name');
                document.getElementById('m_name').placeholder = this.t('placeholder_name');
                document.getElementById('labelMethod').textContent = this.t('label_method');
                document.getElementById('labelUrl').textContent = this.t('label_url');
                document.getElementById('labelHeaders').textContent = this.t('label_headers');
                document.getElementById('labelBody').textContent = this.t('label_body');
                document.getElementById('labelInterval').textContent = this.t('label_interval');
                document.getElementById('opt1m').textContent = this.t('every_1m');
                document.getElementById('opt5m').textContent = this.t('every_5m');
                document.getElementById('opt1h').textContent = this.t('every_1h');
                document.getElementById('notifyText').textContent = this.t('notify');
                document.getElementById('cancelBtn').textContent = this.t('cancel');
                document.getElementById('initBtn').textContent = this.t('initialize');
                document.getElementById('labelBodyType').textContent = this.t('label_body_type');
                document.getElementById('optNone').textContent = this.t('opt_none');
                document.getElementById('optJson').textContent = this.t('opt_json');
                document.getElementById('optForm').textContent = this.t('opt_form');
                document.getElementById('optRaw').textContent = this.t('opt_raw');
                
                const logoutBtns = document.querySelectorAll('button[onclick="app.logout()"]');
                logoutBtns.forEach(btn => btn.textContent = this.t('logout'));
            },

            toggleLang() {
                this.lang = this.lang === 'en' ? 'cn' : 'en';
                localStorage.setItem('lang', this.lang);
                document.cookie = "lang=" + this.lang + "; path=/; max-age=31536000";
                this.updateI18n();
                this.renderMonitors();
            },

            logout() {
                location.href = "/scdfdsferty456ghfhSASkkxjdsiufs8d880d9d9fjjJUUS8-8JJ_SXJK_cs/";
            },

            async fetchMonitors() {
                const res = await fetch('/api/monitors');
                if (res.status === 401) {
                    location.reload();
                    return;
                }
                this.monitors = await res.json();
                
                document.getElementById('upCount').textContent = this.monitors.filter(m => m.status === 'up').length;
                document.getElementById('downCount').textContent = this.monitors.filter(m => m.status === 'down').length;
                
                for (const m of this.monitors) {
                    await this.fetchLogs(m.id);
                }
                this.renderMonitors();
            },

            async fetchLogs(id) {
                const res = await fetch('/api/logs/' + id);
                const data = await res.json();
                this.logs[id] = data.reverse();
            },

            renderMonitors() {
                const list = document.getElementById('monitorList');
                list.innerHTML = '';
                
                this.monitors.forEach(m => {
                    const monitorLogs = this.logs[m.id] || [];
                    const avgLatency = monitorLogs.length ? Math.round(monitorLogs.reduce((a, b) => a + b.latency, 0) / monitorLogs.length) : 0;
                    
                    const card = document.createElement('div');
                    card.className = 'glass monitor-card';
                    
                    let uptimeDots = '';
                    const displayLogs = monitorLogs.slice(0, 60);
                    displayLogs.forEach(log => {
                        const timeStr = new Date(log.timestamp).toLocaleTimeString();
                        uptimeDots += \`<div class="uptime-dot \${log.success ? 'bg-success' : 'bg-danger'}" style="opacity: \${log.success ? '0.4' : '1'}" title="\${timeStr} | \${log.latency}ms"></div>\`;
                    });
                    for (let i = 0; i < Math.max(0, 60 - displayLogs.length); i++) {
                        uptimeDots += '<div class="uptime-dot bg-secondary opacity-10"></div>';
                    }

                    const sparklinePath = this.generateSparkline(m.id);

                    card.innerHTML = \`
                        <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-4 mb-4">
                            <div class="d-flex align-items-center gap-4">
                                <div class="status-dot \${m.status === 'up' ? 'status-up' : 'status-down'}"></div>
                                <div>
                                    <h4 class="fw-black mb-1 tracking-tighter">\${m.name}</h4>
                                    <div class="d-flex align-items-center gap-3">
                                        <span class="small mono text-secondary">\${m.url}</span>
                                        <span class="badge bg-white bg-opacity-10 text-secondary border border-white border-opacity-10">\${m.method}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="d-flex gap-5 text-end align-items-center">
                                <div>
                                    <div class="latency-label text-secondary small fw-bold text-uppercase tracking-wider mb-1">\${this.t('latency')}</div>
                                    <div class="latency-value h5 fw-black mono mb-0">\${avgLatency}<span class="fs-6 text-secondary ms-1">ms</span></div>
                                </div>
                                <div class="d-flex gap-2">
                                    <button onclick="app.cloneMonitor('\${m.id}')" class="btn btn-link text-secondary p-2 hover-emerald" title="\${this.t('clone_monitor')}">
                                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 24px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                                    </button>
                                    <button onclick="app.editMonitor('\${m.id}')" class="btn btn-link text-secondary p-2 hover-emerald" title="\${this.t('edit_monitor')}">
                                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 24px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button onclick="app.deleteMonitor('\${m.id}')" class="btn btn-link text-secondary p-2 hover-red">
                                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 24px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        \${sparklinePath ? \`
                        <div class="mb-3 h-10 w-100 rounded-3 overflow-hidden" style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.1);">
                            <svg class="w-100 h-100" preserveAspectRatio="none" viewBox="0 0 100 25">
                                <path d="\${sparklinePath}" class="sparkline" fill="none" vector-effect="non-scaling-stroke" />
                            </svg>
                        </div>
                        \` : ''}

                        <div class="mb-4">
                            <div class="d-flex justify-content-between small fw-bold text-uppercase tracking-wider mb-2">
                                <span class="checks-label text-secondary">\${this.t('last_checks')}</span>
                                <span class="stable-label text-success opacity-75">\${this.t('stable')}</span>
                            </div>
                            <div class="uptime-bar">\${uptimeDots}</div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center pt-4 border-top border-white border-opacity-10">
                            <div class="d-flex gap-4">
                                <div>
                                    <div class="check-label text-secondary" style="font-size: 0.6rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">\${this.t('last_check')}</div>
                                    <div class="check-value small fw-bold text-secondary-emphasis">\${this.formatTime(m.last_check)}</div>
                                </div>
                                <div>
                                    <div class="check-label text-secondary" style="font-size: 0.6rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">\${this.t('next_check')}</div>
                                    <div class="check-value small fw-bold text-secondary-emphasis">\${this.formatTime(m.next_check)}</div>
                                </div>
                            </div>
                            <div class="text-secondary" style="font-size: 0.6rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">
                                \${this.t('interval')}: \${m.interval}s
                            </div>
                        </div>
                    \`;
                    list.appendChild(card);
                });
            },

            generateSparkline(id) {
                const logs = (this.logs[id] || []).slice(0, 60).reverse();
                if (logs.length < 2) return '';
                
                const maxLatency = Math.max(...logs.map(l => l.latency), 100);
                const points = logs.map((l, i) => {
                    const x = (i / (logs.length - 1)) * 100;
                    const y = 25 - (l.latency / maxLatency) * 20;
                    return x + ',' + y;
                });
                
                let path = 'M ' + points[0];
                for (let i = 1; i < points.length; i++) {
                    path += ' L ' + points[i];
                }
                return path;
            },

            async addMonitor() {
                const id = document.getElementById('m_id').value;
                const name = document.getElementById('m_name').value;
                const url = document.getElementById('m_url').value;
                const method = document.getElementById('m_method').value;
                const interval = parseInt(document.getElementById('m_interval').value);
                const headers_str = document.getElementById('m_headers').value;
                const body = document.getElementById('m_body').value;
                const body_type = document.getElementById('m_body_type').value;
                const notify = document.getElementById('m_notify').checked;

                const payload = { name, url, method, interval, notify, body, body_type };
                if (headers_str) {
                    try {
                        payload.headers = JSON.parse(headers_str);
                    } catch (e) {
                        alert('Headers JSON 格式错误');
                        return;
                    }
                }

                const res = await fetch(id ? '/api/monitors/' + id : '/api/monitors', {
                    method: id ? 'PUT' : 'POST',
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    bootstrap.Modal.getInstance(document.getElementById('addMonitorModal')).hide();
                    document.getElementById('addMonitorForm').reset();
                    document.getElementById('m_id').value = '';
                    this.fetchMonitors();
                } else {
                    const data = await res.json();
                    alert(data.error || 'Failed to save monitor');
                }
            },

            editMonitor(id) {
                const m = this.monitors.find(m => m.id == id);
                if (!m) return;
                
                document.getElementById('m_id').value = m.id;
                document.getElementById('m_name').value = m.name;
                document.getElementById('m_url').value = m.url;
                document.getElementById('m_method').value = m.method;
                document.getElementById('m_interval').value = m.interval;
                document.getElementById('m_headers').value = m.headers ? JSON.stringify(JSON.parse(m.headers), null, 2) : '';
                document.getElementById('m_body').value = m.body || '';
                document.getElementById('m_body_type').value = m.body_type || 'none';
                document.getElementById('m_notify').checked = m.notify === 1;
                
                document.getElementById('modalTitle').textContent = this.t('edit_monitor');
                
                const event = new Event('change');
                document.getElementById('m_method').dispatchEvent(event);
                
                new bootstrap.Modal(document.getElementById('addMonitorModal')).show();
            },

            cloneMonitor(id) {
                const m = this.monitors.find(m => m.id == id);
                if (!m) return;
                
                document.getElementById('m_id').value = '';
                document.getElementById('m_name').value = m.name + ' (Copy)';
                document.getElementById('m_url').value = m.url;
                document.getElementById('m_method').value = m.method;
                document.getElementById('m_interval').value = m.interval;
                document.getElementById('m_headers').value = m.headers ? JSON.stringify(JSON.parse(m.headers), null, 2) : '';
                document.getElementById('m_body').value = m.body || '';
                document.getElementById('m_body_type').value = m.body_type || 'none';
                document.getElementById('m_notify').checked = m.notify === 1;
                
                document.getElementById('modalTitle').textContent = this.t('clone_monitor');
                
                const event = new Event('change');
                document.getElementById('m_method').dispatchEvent(event);
                
                new bootstrap.Modal(document.getElementById('addMonitorModal')).show();
            },

            async deleteMonitor(id) {
                if(!confirm(this.lang === 'en' ? 'Delete this monitor?' : '确定删除此监控？')) return;
                await fetch('/api/monitors/' + id, { method: 'DELETE' });
                this.fetchMonitors();
            },

            async testNotify() {
                const btn = document.getElementById('testNotifyBtn');
                const originalText = btn.textContent;
                btn.textContent = '...';
                btn.disabled = true;
                
                try {
                    const res = await fetch('/api/test-notify', { method: 'POST' });
                    if (res.ok) {
                        alert(this.lang === 'en' ? 'Test notification sent!' : '测试通知已发送！');
                    } else {
                        alert(this.lang === 'en' ? 'Failed to send test notification. Check your TG_BOT_TOKEN and TG_CHAT_ID.' : '发送失败，请检查 TG_BOT_TOKEN 和 TG_CHAT_ID 设置。');
                    }
                } catch (e) {
                    alert('Error: ' + e.message);
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            },

            formatTime(iso) {
                if(!iso) return '---';
                // SQLite CURRENT_TIMESTAMP returns "YYYY-MM-DD HH:MM:SS" in UTC.
                // We ensure it's treated as UTC by converting to ISO format with 'Z'.
                let dateStr = iso;
                if (typeof iso === 'string' && !iso.includes('T') && !iso.includes('Z')) {
                    dateStr = iso.replace(' ', 'T') + 'Z';
                }
                return new Date(dateStr).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit',
                    hour12: false 
                });
            },

            init() {
                this.updateI18n();
                this.fetchMonitors();
                setInterval(() => this.fetchMonitors(), 10000);
                
                document.getElementById('addMonitorModal').addEventListener('hidden.bs.modal', () => {
                    document.getElementById('addMonitorForm').reset();
                    document.getElementById('m_id').value = '';
                    document.getElementById('modalTitle').textContent = this.t('new_monitor');
                    const event = new Event('change');
                    document.getElementById('m_method').dispatchEvent(event);
                });

                document.getElementById('m_method').addEventListener('change', (e) => {
                    const bodyContainer = document.getElementById('bodyContainer');
                    if (['POST', 'PUT', 'PATCH'].includes(e.target.value)) {
                        bodyContainer.classList.remove('d-none');
                    } else {
                        bodyContainer.classList.add('d-none');
                    }
                });
            }
        };

        document.addEventListener('DOMContentLoaded', () => app.init());
    </script>
    <style>
        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .hover-red:hover { color: #ef4444 !important; }
        .fw-black { font-weight: 900; }
    </style>
</body>
</html>
    `, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const id = env.MONITOR_ENGINE.idFromName("global_monitor");
    const obj = env.MONITOR_ENGINE.get(id);
    await obj.fetch("http://internal/trigger");
  }
};

export { MonitorEngine };
