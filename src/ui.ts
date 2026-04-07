export const INDEX_HTML = `
<!DOCTYPE html>
<html lang="zh" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Uptime Pro | 边缘监控面板</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { 
            background-color: #000; 
            color: #059669;
        }
                /* === 新增加载动画相关样式 === */
        .loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
            border-radius: inherit;
        }
        .loading-overlay.active {
            opacity: 1;
            pointer-events: all;
        }
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(16, 185, 129, 0.1);
            border-radius: 50%;
            border-top-color: #10b981;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        /* 布局修正 */
        .monitor-list-container { position: relative; min-height: 200px; }
        #quickMonitorList { position: relative; min-height: 100px; }

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
        .status-down { background-color: #8a1616; box-shadow: 0 0 15px rgba(239, 68, 68, 0.5); }
        
        .uptime-bar { display: flex; gap: 2px; height: 30px; }
        .uptime-dot { 
            flex: 1; 
            border-radius: 3px; 
            transition: all 0.2s ease; 
        }
        .uptime-dot:hover { transform: scaleY(1.2); filter: brightness(1.3); }
        
        .sparkline { stroke: #10b981; stroke-width: 2; fill: rgba(16, 185, 129, 0.1); }
        
        .btn-emerald {
            background-color: #0ea170;
            color: #e3e6d6;
            border: none;
            font-weight: 800;
            padding: 0.8rem 1.5rem;
            border-radius: 1rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .btn-emerald:hover { background-color: #059669; color: #e3e6d6; }
        
        .btn-outline-emerald {
            background-color: transparent;
            color: #0ea170;
            border: 2px solid #0ea170;
        }
        .btn-outline-emerald:hover {
            background-color: #0ea170;
            color: #e3e6d6;
        }
        .btn-outline-emerald:disabled {
            border-color: #222;
            color: #444;
            cursor: not-allowed;
        }

        /* Back to Top Button */
        #backToTop {
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 50px;
            height: 50px;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 50%;
            display: none;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
            z-index: 1000;
            transition: transform 0.2s ease, background 0.2s ease;
        }
        #backToTop:hover {
            transform: translateY(-5px);
            background: #059669;
        }
        
        .sidebar-pagination {
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            margin-top: auto;
            padding-top: 1rem;
        }
        
        .modal-content {
            background-color: #09090b;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 2rem;
        }
        /* 滚动条美化 */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 10px; }
        
        
        .brand { font-weight: 900; letter-spacing: -0.05em; font-size: 2rem; color: #f8fafc; }
        .brand span { color: #10b981; }
        #engineStatusText { color: #60a5fa !important; }
        .text-secondary { color: #94a3b8 !important; }
        .card-stat .h1 { color: #059669; }
        #upCount { color: #34d399 !important; }
        #downCount { color: #c94545 !important; }
        #operationalLabel { color: #10b981 !important; }
        #downLabel { color: #b63030 !important; }
        #uptimeLabel { color: #60a5fa !important; }
        .form-label { color: #c084fc !important; }
        .monitor-card h4 { color: #27da17; }
        .monitor-card .latency-label { color: #a1a1aa !important; }
        .monitor-card .latency-value { color: #fbbf24 !important; }
        .monitor-card .checks-label { color: #c084fc !important; }
        .monitor-card .stable-label { color: #34d399 !important; }
        .monitor-card .check-label { color: #71717a !important; }
        .monitor-card .check-value { color: #8fdda0 !important; }
        .hover-emerald:hover { color: #10b981 !important; }
        .hover-red:hover { color: #ef4444 !important; }
        .fw-black { font-weight: 900; }
        
        .sidebar {
            width: 30%;
            height: 100vh;
            position: sticky;
            top: 0;
            overflow-y: auto;
            flex-shrink: 0;
            background: rgba(255, 255, 255, 0.01);
            backdrop-filter: blur(10px);
            z-index: 1000;
            transition: width 0.05s linear;
        }
        .sidebar-resizer {
            width: 4px;
            height: 100%;
            position: absolute;
            right: 0;
            top: 0;
            cursor: col-resize;
            background: rgba(255, 255, 255, 0.05);
            transition: background 0.2s;
        }
        .sidebar-resizer:hover {
            background: rgba(16, 185, 129, 0.5);
        }
        .sidebar-item {
            border: 1px solid rgba(255, 255, 255, 0.03);
            transition: background 0.2s ease, border-color 0.2s ease;
            cursor: pointer;
            white-space: nowrap;
            overflow: hidden;
        }
        .sidebar-item:hover {
            background: rgba(255, 255, 255, 0.05) !important;
            border-color: rgba(255, 255, 255, 0.1) !important;
        }
        .sidebar-item.active {
            background: rgba(16, 185, 129, 0.1) !important;
            border-color: rgba(16, 185, 129, 0.3) !important;
        }
        
        /* 成功率颜色 */
        .rate-high { color: #10b981 !important; }
        .rate-mid { color: #fbbf24 !important; }
        .rate-low { color: #ef4444 !important; }
        
        .main-content {
            flex: 1;
            min-width: 0;
            overflow-x: hidden;
        }
        @media (max-width: 991px) {
            .sidebar {
                display: none !important;
            }
        }
        .form-control:focus, .form-select:focus {
            border-color: #059669 !important;
            box-shadow: 0 0 0 0.25rem rgba(16, 185, 129, 0.25);
        }
    
    </style>
</head>
<body>
    <div class="d-flex min-vh-100">
        <!-- Sidebar -->
        <aside class="sidebar border-end border-white border-opacity-10 p-3 d-none d-lg-block d-flex flex-column" id="sidebar">
            <div class="sidebar-resizer" id="sidebarResizer"></div>
            <div class="d-flex justify-content-between align-items-center mb-4 px-2">
                <h6 class="fw-bold text-white mb-0" id="allMonitorsTitle">所有监控</h6>
                <button onclick="app.fetchMonitors()" class="btn btn-link text-secondary p-0">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
            </div>
            <div id="quickMonitorList" class="d-flex flex-column gap-2 scrollbar-thin flex-grow-1 position-relative">
                <div id="sidebarLoading" class="loading-overlay">
                    <div class="spinner"></div>
                </div>
                <div id="quickMonitorItems" class="d-flex flex-column gap-2">
                    <!-- JS 动态生成 -->
                </div>
            </div>
            <!-- 左侧边栏分页 -->
            <div id="sidebarPagination" class="sidebar-pagination">
                <!-- JS 动态生成 -->
            </div>
        </aside>

        <!-- Main Content -->
        <div class="main-content">
            <div class="container py-5">
        <header class="d-flex justify-content-between align-items-center mb-5">
            <div>
                <div class="brand">UPTIME<span>PRO</span></div>
                <div class="d-flex align-items-center gap-2">
                    <span class="status-dot status-up" style="width: 8px; height: 8px; animation: pulse 2s infinite;"></span>
                    <span class="text-secondary small fw-bold text-uppercase tracking-wider" id="engineStatusText">Edge Monitoring Engine</span>
                </div>
            </div>
            <div class="d-flex align-items-center gap-3">
                <div class="d-flex align-items-center gap-2 me-3">
                    <span class="text-secondary small fw-bold text-uppercase tracking-wider" id="pageSizeLabel">Page Size</span>
                    <select id="pageSizeSelect" onchange="app.changePageSize(this.value)" class="form-select form-select-sm bg-dark text-white border-white border-opacity-10 rounded-pill px-3" style="width: 80px;">
                        <option value="10">10</option>
                        <option value="20" selected>20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>
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
                    <div class="h1 fw-black mb-0" id="avgUptime">99.9<span class="fs-4 text-secondary">%</span></div>
                </div>
            </div>
        </div>
        <!-- 监控列表 -->
        <div id="monitorList" class="monitor-list-container">
            <div id="mainLoading" class="loading-overlay">
                <div class="spinner"></div>
            </div>
            <div id="monitorItems" class="space-y-4">
                <!-- 动态加载 -->
            </div>
        </div>
        <!-- 分页控制 -->
        <div id="pagination" class="d-flex justify-content-center align-items-center gap-3 mt-5 mb-5">
            <!-- 动态加载 -->
        </div>
    </div>
</div>

    <button id="backToTop" onclick="app.scrollToTop()">
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
    </button>

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
                                <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelType">Monitor Type</label>
                                <select id="m_type" class="form-select">
                                    <option value="http" id="optHttp">HTTP/HTTPS</option>
                                    <option value="tcp" id="optTcp">TCP Port</option>
                                </select>
                            </div>
                        </div>
                        <div class="row g-3 mb-4">
                            <div class="col-md-8">
                                <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelUrl">Target Endpoint</label>
                                <input type="url" id="m_url" class="form-control mono" placeholder="https://api.example.com/v1" required>
                                <div class="small text-warning mt-1 ms-1" id="ipHint" style="font-size: 0.7rem;"></div>
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
                latency: 'Latest Latency',
                status_code: 'Status Code',
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
                label_body_type: 'Request Body Encoding',
                opt_none: 'None',
                opt_json: 'JSON (application/json)',
                opt_form: 'Form (application/x-www-form-urlencoded)',
                opt_raw: 'Raw (text/plain)',
                ip_hint: 'Cloudflare Workers only support HTTP/HTTPS protocols. Direct IP monitoring is not supported.',
                label_type: 'Monitor Type',
                opt_http: 'HTTP/HTTPS',
                opt_tcp: 'TCP Port',
                tcp_placeholder: 'example.com:22',
                tcp_hint: 'Enter the target as host:port (e.g., example.com:22 or 1.1.1.1:53)',
                label_url_tcp: 'Target Host:Port',
                all_monitors: 'All Monitors',
                prev: 'Previous',
                next: 'Next',
                page_info: 'Page {page} of {total}',
                page_size: 'Page Size'
            },
            cn: {
                engine_status: '边缘监控引擎',
                deploy_btn: '部署监控',
                operational: '正常运行',
                down: '检测到故障',
                avg_uptime: '平均可用率',
                latency: '当前延迟',
                status_code: '状态码',
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
                label_body_type: '请求体编码',
                opt_none: '无',
                opt_json: 'JSON (application/json)',
                opt_form: '表单 (application/x-www-form-urlencoded)',
                opt_raw: '原始数据 (text/plain)',
                ip_hint: 'Cloudflare Workers 仅支持 HTTP/HTTPS 协议，不支持直接 IP 监控。',
                label_type: '监控类型',
                opt_http: 'HTTP/HTTPS',
                opt_tcp: 'TCP 端口',
                tcp_placeholder: 'example.com:22',
                tcp_hint: '请输入目标地址，格式为 host:port (例如 example.com:22 或 1.1.1.1:53)',
                label_url_tcp: '目标地址 (Host:Port)',
                all_monitors: '所有监控',
                prev: '上一页',
                next: '下一页',
                page_info: '第 {page} 页，共 {total} 页',
                page_size: '每页数量'
            }
        };

        const app = {
            monitors: [],
            logs: {},
            lang: localStorage.getItem('lang') || 'en',
            // --- 状态持久化优化 ---
            page: parseInt(localStorage.getItem('currentPage')) || 1,
            pageSize: parseInt(localStorage.getItem('pageSize')) || 20,
            lastFetchParams: '', // 用于对比参数是否变化
            total: 0,
            totalPages: 0,
            t(key, params = {}) {
                let text = i18n[this.lang][key] || key;
                for (const k in params) {
                    text = text.replace('{' + k + '}', params[k]);
                }
                return text;
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
                document.getElementById('ipHint').textContent = this.t('ip_hint');
                document.getElementById('labelType').textContent = this.t('label_type');
                document.getElementById('optHttp').textContent = this.t('opt_http');
                document.getElementById('optTcp').textContent = this.t('opt_tcp');
                document.getElementById('allMonitorsTitle').textContent = this.t('all_monitors');
                document.getElementById('pageSizeLabel').textContent = this.t('page_size');
                
                const logoutBtns = document.querySelectorAll('button[onclick="app.logout()"]');
                logoutBtns.forEach(btn => btn.textContent = this.t('logout'));
            },

            toggleLang() {
                this.lang = this.lang === 'en' ? 'cn' : 'en';
                localStorage.setItem('lang', this.lang);
                document.cookie = "lang=" + this.lang + "; path=/; max-age=31536000";
                this.updateI18n();
            },

            logout() {
                location.href = "/scdfdsferty456ghfhSASkkxjdsiufs8d880d9d9fjjJUUS8-8JJ_SXJK_cs/";
            },

            changePageSize(size) {
                this.pageSize = parseInt(size);
                this.page = 1;
                localStorage.setItem('pageSize', this.pageSize);
                localStorage.setItem('currentPage', 1);
                this.fetchMonitors();
            },

            scrollToTop() {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            },

            async fetchMonitors(page = this.page) {
                const currentParams = \`p=\${page}&s=\${this.pageSize}\`;
                const isSilent = this.lastFetchParams === currentParams;
                
                const mainLoading = document.getElementById('mainLoading');
                const sidebarLoading = document.getElementById('sidebarLoading');
                
                if (!isSilent) {
                    if (mainLoading) mainLoading.classList.add('active');
                    if (sidebarLoading) sidebarLoading.classList.add('active');
                }
                
                try {
                    this.page = page;
                    const res = await fetch(\`/api/monitors?page=\${this.page}&pageSize=\${this.pageSize}\`);
                    if (res.status === 401) {
                        location.reload();
                        return;
                    }
                    const data = await res.json();
                    this.monitors = data.monitors;
                    this.total = data.total;
                    this.totalPages = data.totalPages;
                    this.lastFetchParams = currentParams;

                    this.monitors.forEach(m => {
                        if (m.logs) this.logs[m.id] = m.logs;
                    });

                    document.getElementById('upCount').textContent = data.upCount || 0;
                    document.getElementById('downCount').textContent = data.downCount || 0;
                    document.getElementById('avgUptime').innerHTML = (data.avgUptime || '---') + '<span class="fs-4 text-secondary">%</span>';
                    
                    this.renderQuickMonitors();
                    this.renderMonitors();
                    this.renderPagination();
                } catch (e) {
                    console.error("Fetch monitors failed", e);
                } finally {
                    if (!isSilent) {
                        setTimeout(() => {
                            if (mainLoading) mainLoading.classList.remove('active');
                            if (sidebarLoading) sidebarLoading.classList.remove('active');
                        }, 300);
                    }
                }
            },
            renderPagination() {
                const container = document.getElementById('pagination');
                const sidebarContainer = document.getElementById('sidebarPagination');
                if (!container) return;
                
                if (this.totalPages <= 1 && this.page === 1) {
                    container.innerHTML = '';
                    if (sidebarContainer) sidebarContainer.innerHTML = '';
                    return;
                }

                const prevDisabled = this.page <= 1 ? 'disabled' : '';
                const nextDisabled = this.page >= this.totalPages ? 'disabled' : '';

                const html = \`
                    <button onclick="app.fetchMonitors(\${this.page - 1})" class="btn btn-outline-emerald px-4 py-2 rounded-pill fw-bold" \${prevDisabled}>
                        \${this.t('prev')}
                    </button>
                    <span class="text-secondary small fw-bold mono">
                        \${this.t('page_info', { page: this.page, total: this.totalPages })}
                    </span>
                    <button onclick="app.fetchMonitors(\${this.page + 1})" class="btn btn-outline-emerald px-4 py-2 rounded-pill fw-bold" \${nextDisabled}>
                        \${this.t('next')}
                    </button>
                \`;
                
                container.innerHTML = html;
                
                if (sidebarContainer) {
                    sidebarContainer.innerHTML = \`
                        <div class="d-flex justify-content-between align-items-center gap-2 px-2">
                            <button onclick="app.fetchMonitors(\${this.page - 1})" class="btn btn-link text-secondary p-0" \${prevDisabled}>
                                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <span class="text-secondary small mono" style="font-size: 0.7rem;">
                                \${this.page} / \${this.totalPages}
                            </span>
                            <button onclick="app.fetchMonitors(\${this.page + 1})" class="btn btn-link text-secondary p-0" \${nextDisabled}>
                                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    \`;
                }
            },

            renderMonitors() {
                const list = document.getElementById('monitorItems');
                if (!list) return;
                list.innerHTML = '';
                
                this.monitors.forEach(m => {
                    const card = document.createElement('div');
                    card.className = 'glass monitor-card border border-white border-opacity-10';
                    card.id = 'monitor-card-' + m.id;
                    card.innerHTML = this.getMonitorCardHtml(m);
                    list.appendChild(card);
                });
            },

            getQuickMonitorHtml(m) {
                const monitorLogs = this.logs[m.id] || [];
                const statusClass = m.status === 'up' ? 'status-up' : 'status-down';
                const uptime = m.uptime !== undefined ? m.uptime : 100;
                
                let rateColorClass = 'rate-high';
                if (uptime < 80) rateColorClass = 'rate-low';
                else if (uptime < 95) rateColorClass = 'rate-mid';

                let miniBar = '';
                const recentLogs = monitorLogs.slice(-20);
                recentLogs.forEach(log => {
                    miniBar += \`<div style="width: 4px; height: 12px; background: \${log.success ? '#10b981' : '#ef4444'}; opacity: \${log.success ? '0.8' : '1'}; border-radius: 1px;"></div>\`;
                });
                for (let i = 0; i < 20 - recentLogs.length; i++) {
                    miniBar += '<div style="width: 4px; height: 12px; background: rgba(255,255,255,0.1); border-radius: 1px;"></div>';
                }

                return \`<div class="sidebar-item d-flex align-items-center gap-2 p-2 rounded-2 mono" id="sidebar-item-\${m.id}" onclick="app.showMonitorDetail('\${m.id}')">\` +
                        \`<div class="d-flex align-items-center gap-1 px-1" style="background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">\` +
                            \`<div class="status-dot \${statusClass}" style="width: 6px; height: 6px; flex-shrink: 0;"></div>\` +
                            \`<span class="\${rateColorClass}" style="font-size: 0.7rem;">\${uptime}%</span>\` +
                        \`</div>\` +
                        \`<div class="text-white small text-truncate flex-grow-1 fw-bold" style="font-size: 0.75rem;">\${m.name}</div>\` +
                        \`<div class="d-flex gap-1 align-items-center" style="flex-shrink: 0; background: rgba(0,0,0,0.3); padding: 2px; border-radius: 3px;">\` +
                            miniBar +
                        \`</div>\` +
                    \`</div>\`;
            },

            renderQuickMonitors() {
                const container = document.getElementById('quickMonitorItems');
                if (!container) return;
                
                if (this.monitors.length === 0) {
                    container.innerHTML = \`
                        <div class="text-center py-4 w-100">
                            <p class="text-secondary small mb-0">\${this.lang === 'en' ? 'No monitors yet.' : '暂无监控项'}</p>
                        </div>
                    \`;
                    return;
                }

                container.innerHTML = this.monitors.map(m => this.getQuickMonitorHtml(m)).join('');
            },

            showMonitorDetail(id) {
                document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
                const sidebarItem = document.getElementById(\`sidebar-item-\${id}\`);
                if (sidebarItem) sidebarItem.classList.add('active');

                const detailCard = document.getElementById(\`monitor-card-\${id}\`);
                if (detailCard) {
                    detailCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    detailCard.classList.add('border-primary');
                    detailCard.style.boxShadow = '0 0 25px rgba(16, 185, 129, 0.2)';
                    setTimeout(() => {
                        detailCard.classList.remove('border-primary');
                        detailCard.style.boxShadow = '';
                    }, 2000);
                }
            },

            showMonitorDetail(id) {
                const detailCard = document.getElementById(\`monitor-card-\${id}\`);
                if (detailCard) {
                    detailCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    detailCard.classList.add('border-primary');
                    detailCard.style.boxShadow = '0 0 20px rgba(13, 110, 253, 0.3)';
                    setTimeout(() => {
                        detailCard.classList.remove('border-primary');
                        detailCard.style.boxShadow = '';
                    }, 3000);
                }
            },

            updateMonitorCard(id) {
                const card = document.getElementById(\`monitor-card-\${id}\`);
                if (!card) return;
                const m = this.monitors.find(m => m.id == id);
                if (!m) return;
                card.innerHTML = this.getMonitorCardHtml(m);
            },

            getMonitorCardHtml(m) {
                const monitorLogs = this.logs[m.id] || [];
                const latestLatency = monitorLogs.length ? monitorLogs[monitorLogs.length - 1].latency : 0;
                const latestStatusCode = monitorLogs.length ? monitorLogs[monitorLogs.length - 1].status_code : 0;
                
                
                let uptimeDots = '';
                // 后端存储的是正序，前端展示最近 60 条
                const displayLogs = monitorLogs.slice(-60);
                displayLogs.forEach(log => {
                    const timeStr = new Date(log.timestamp).toLocaleTimeString();
                      uptimeDots += \`<div class="uptime-dot \${log.success ? 'bg-success' : 'bg-danger'}" style="opacity: \${log.success ? '0.4' : '1'}" title="\${timeStr} | \${log.status_code} | \${log.latency}ms"></div>\`;
          });
                for (let i = 0; i < Math.max(0, 60 - displayLogs.length); i++) {
                    uptimeDots += '<div class="uptime-dot bg-secondary opacity-10"></div>';
                }

                const sparklinePath = this.generateSparkline(m.id);

                return \`
                    <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-4 mb-4">
                        <div class="d-flex align-items-center gap-4" style="min-width: 0; flex: 1;">
                            <div class="status-dot \${m.status === 'up' ? 'status-up' : 'status-down'}" style="flex-shrink: 0;"></div>
                            <div style="min-width: 0; flex: 1;">
                                <h4 class="fw-black mb-1 tracking-tighter text-truncate" title="\${m.name}">\${m.name}</h4>
                                <div class="d-flex align-items-center gap-3" style="min-width: 0;">
                                    <span class="small mono text-secondary text-truncate" style="max-width: 350px;" title="\${m.url}">\${m.url}</span>
                                    \${m.type === 'tcp' ? 
                                        '<span class="badge bg-white bg-opacity-10 text-warning border border-white border-opacity-10" style="flex-shrink: 0;">TCP</span>' :
                                        '<span class="badge bg-white bg-opacity-10 text-secondary border border-white border-opacity-10" style="flex-shrink: 0;">' + m.method + '</span>'
                                    }
                                    \${m.type !== 'tcp' && m.body_type && m.body_type !== 'none' ? '<span class="badge bg-white bg-opacity-10 text-info border border-white border-opacity-10 ms-1" style="flex-shrink: 0; font-size: 0.6rem;">' + m.body_type.toUpperCase() + '</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="d-flex gap-5 text-end align-items-center" style="flex-shrink: 0;">
                            <div>
                                <div class="latency-label text-secondary small fw-bold text-uppercase tracking-wider mb-1">\${this.t('latency')}</div>
                                <div class="latency-value h5 fw-black mono mb-0">\${latestLatency}<span class="fs-6 text-secondary ms-1">ms</span></div>
                            </div>
                             <div>
                                <div class="status-code-label text-secondary small fw-bold text-uppercase tracking-wider mb-1">\${this.t('status_code')}</div>
                                <div class="status-code-value h5 fw-black mono mb-0">\${latestStatusCode || '-'}</div>
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
                        <div class="text-secondary" style="font-size: 1.0rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">
                            \${this.t('interval')}: \${m.interval}s
                        </div>
                    </div>
                \`;
            },

            generateSparkline(id) {
                const logs = (this.logs[id] || []).slice(-60);
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
                const initBtn = document.getElementById('initBtn');
                // 保存原始文本，以便恢复（考虑到多语言，最好重新获取或硬编码，这里简单处理）
                const originalText = this.t('initialize'); 
                
                // 1. 防止重复点击：禁用按钮并显示加载中
                if (initBtn) {
                    initBtn.disabled = true;
                    initBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Saving...';
                }

                try {
                    const id = document.getElementById('m_id').value;
                    const name = document.getElementById('m_name').value;
                    const url = document.getElementById('m_url').value;
                    const type = document.getElementById('m_type').value;
                    const method = document.getElementById('m_method').value;
                    const interval = parseInt(document.getElementById('m_interval').value);
                    const headers_str = document.getElementById('m_headers').value;
                    const body = document.getElementById('m_body').value;
                    const body_type = document.getElementById('m_body_type').value;
                    const notify = document.getElementById('m_notify').checked;

                    // 基本校验
                    if (!name || !url) {
                        alert(this.lang === 'en' ? 'Name and URL are required' : '名称和地址不能为空');
                        return; // 注意：这里 return 前需要恢复按钮，或者让外层 catch 处理，但因为是同步校验，最好手动恢复
                        if (initBtn) {
                            initBtn.disabled = false;
                            initBtn.textContent = originalText;
                        }
                        return;
                    }

                    const payload = { name, url, type, method, interval, notify, body, body_type };
                    if (headers_str) {
                        try {
                            payload.headers = JSON.parse(headers_str);
                        } catch (e) {
                            alert('Headers JSON 格式错误');
                            if (initBtn) {
                                initBtn.disabled = false;
                                initBtn.textContent = originalText;
                            }
                            return;
                        }
                    }

                    // --- [测试用] 如果需要模拟延迟，取消下面这行的注释 ---
                    // await new Promise(resolve => setTimeout(resolve, 1500)); 

                    const res = await fetch(id ? '/api/monitors/' + id : '/api/monitors', {
                        method: id ? 'PUT' : 'POST',
                        headers: { 'Content-Type': 'application/json' }, // 确保发送 JSON 头
                        body: JSON.stringify(payload)
                    });

                    if (res.ok) {
                        // 2. 成功：关闭模态框
                        // 注意：不再手动调用 fetchMonitors，依赖 WebSocket 的 'add' 消息更新 UI，避免闪烁和重复请求
                        const modalEl = document.getElementById('addMonitorModal');
                        const modal = bootstrap.Modal.getInstance(modalEl);
                        if (modal) {
                            modal.hide();
                        }
                        
                        // 重置表单
                        document.getElementById('addMonitorForm').reset();
                        document.getElementById('m_id').value = '';
                        
                    } else {
                        const data = await res.json();
                        alert(data.error || 'Failed to save monitor');
                    }
                } catch (e) {
                    console.error(e);
                    alert('Network error: ' + e.message);
                } finally {
                    // 3. 无论成功失败，都恢复按钮状态
                    if (initBtn) {
                        initBtn.disabled = false;
                        initBtn.textContent = originalText;
                    }
                }
            },

            editMonitor(id) {
                const m = this.monitors.find(m => m.id == id);
                if (!m) return;
                
                document.getElementById('m_id').value = m.id;
                document.getElementById('m_name').value = m.name;
                document.getElementById('m_url').value = m.url;
                document.getElementById('m_type').value = m.type || 'http';
                document.getElementById('m_method').value = m.method;
                document.getElementById('m_interval').value = m.interval;
                document.getElementById('m_headers').value = m.headers ? (typeof m.headers === 'string' ? JSON.stringify(JSON.parse(m.headers), null, 2) : JSON.stringify(m.headers, null, 2)) : '';
                document.getElementById('m_body').value = m.body || '';
                document.getElementById('m_body_type').value = m.body_type || 'none';
                document.getElementById('m_notify').checked = m.notify === 1;
                
                document.getElementById('modalTitle').textContent = this.t('edit_monitor');
                
                const event = new Event('change');
                document.getElementById('m_type').dispatchEvent(event);
                document.getElementById('m_method').dispatchEvent(event);
                
                new bootstrap.Modal(document.getElementById('addMonitorModal')).show();
            },

            cloneMonitor(id) {
                const m = this.monitors.find(m => m.id == id);
                if (!m) return;
                
                document.getElementById('m_id').value = '';
                document.getElementById('m_name').value = m.name + ' (Copy)';
                document.getElementById('m_url').value = m.url;
                document.getElementById('m_type').value = m.type || 'http';
                document.getElementById('m_method').value = m.method;
                document.getElementById('m_interval').value = m.interval;
                               document.getElementById('m_headers').value = m.headers ? (typeof m.headers === 'string' ? JSON.stringify(JSON.parse(m.headers), null, 2) : JSON.stringify(m.headers, null, 2)) : '';
                document.getElementById('m_body').value = m.body || '';
                document.getElementById('m_body_type').value = m.body_type || 'none';
                document.getElementById('m_notify').checked = m.notify === 1;
                
                document.getElementById('modalTitle').textContent = this.t('clone_monitor');
                
                const event = new Event('change');
                document.getElementById('m_type').dispatchEvent(event);
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
                // 1. 同步 PageSize 设置
                // 1. 【新增】同步顶部导航的每页数量下拉框
                // 确保页面一打开，下拉框显示的数字就是用户上次选的数字
                const pageSizeSelect = document.getElementById('pageSizeSelect');
                if (pageSizeSelect) {
                    pageSizeSelect.value = this.pageSize;
                }

                // 2. 初始加载
                this.updateI18n();
                this.renderQuickMonitors();
                this.fetchMonitors(); // 始终从 page: 1 开始
                
                // 3. 定时刷新
                setInterval(() => this.fetchMonitors(), 10000);
                
                // 4. 侧边栏调整 (Sidebar Resizer)
                const sidebar = document.getElementById('sidebar');
                const resizer = document.getElementById('sidebarResizer');
                let isResizing = false;

                const savedWidth = localStorage.getItem('sidebarWidth');
                if (savedWidth) sidebar.style.width = savedWidth + 'px';

                resizer.addEventListener('mousedown', (e) => {
                    isResizing = true;
                    document.body.style.cursor = 'col-resize';
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isResizing) return;
                    const newWidth = e.clientX;
                    if (newWidth > 180 && newWidth < 600) {
                        sidebar.style.width = newWidth + 'px';
                        localStorage.setItem('sidebarWidth', newWidth);
                    }
                });

                document.addEventListener('mouseup', () => {
                    isResizing = false;
                    document.body.style.cursor = 'default';
                });

                // 5. Modal 隐藏时的重置逻辑
                document.getElementById('addMonitorModal').addEventListener('hidden.bs.modal', () => {
                    document.getElementById('addMonitorForm').reset();
                    document.getElementById('m_id').value = '';
                    document.getElementById('modalTitle').textContent = this.t('new_monitor');
                    const event = new Event('change');
                    document.getElementById('m_type').dispatchEvent(event);
                    document.getElementById('m_method').dispatchEvent(event);
                });

                // 6. TCP / HTTP 类型切换逻辑
                document.getElementById('m_type').addEventListener('change', (e) => {
                    const isTcp = e.target.value === 'tcp';
                    const methodCol = document.getElementById('m_method').closest('.col-md-4');
                    const headersGroup = document.getElementById('m_headers').closest('.mb-4');
                    const bodyGroup = document.getElementById('bodyContainer');
                    const urlCol = document.getElementById('m_url').closest('[class*="col-md-"]');
                    const urlLabel = document.getElementById('labelUrl');
                    const urlInput = document.getElementById('m_url');
                    const ipHint = document.getElementById('ipHint');
                    
                    methodCol.classList.toggle('d-none', isTcp);
                    headersGroup.classList.toggle('d-none', isTcp);
                    
                    if (isTcp) {
                        bodyGroup.classList.add('d-none');
                        urlInput.placeholder = this.t('tcp_placeholder');
                        urlInput.type = 'text';
                        urlLabel.textContent = this.t('label_url_tcp');
                        urlCol.className = 'col-md-12';
                        ipHint.textContent = this.t('tcp_hint');
                        ipHint.classList.remove('text-danger', 'text-warning');
                        ipHint.classList.add('text-info');
                    } else {
                        urlInput.placeholder = 'https://api.example.com/v1';
                        urlInput.type = 'url';
                        urlLabel.textContent = this.t('label_url');
                        urlCol.className = 'col-md-8';
                        ipHint.textContent = '';
                        const method = document.getElementById('m_method').value;
                        if (['POST', 'PUT', 'PATCH'].includes(method)) {
                            bodyGroup.classList.remove('d-none');
                        }
                    }
                });

                // 7. Method 切换显示 Body 逻辑
                document.getElementById('m_method').addEventListener('change', (e) => {
                    const isTcp = document.getElementById('m_type').value === 'tcp';
                    if (isTcp) return;
                    
                    const bodyContainer = document.getElementById('bodyContainer');
                    if (['POST', 'PUT', 'PATCH'].includes(e.target.value)) {
                        bodyContainer.classList.remove('d-none');
                    } else {
                        bodyContainer.classList.add('d-none');
                    }
                });

                // 8. URL 实时校验 (IP 提示)
                document.getElementById('m_url').addEventListener('input', (e) => {
                    const isTcp = document.getElementById('m_type').value === 'tcp';
                    const hint = document.getElementById('ipHint');
                    if (isTcp) {
                        hint.textContent = this.t('tcp_hint');
                        hint.classList.remove('text-danger', 'text-warning');
                        hint.classList.add('text-info');
                        return;
                    }

                    const url = e.target.value;
                    try {
                        const urlObj = new URL(url);
                        const hostname = urlObj.hostname;
                        if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) || hostname.includes(':')) {
                            hint.textContent = this.t('ip_hint');
                            hint.classList.add('text-danger');
                            hint.classList.remove('text-warning', 'text-info');
                        } else {
                            hint.textContent = '';
                        }
                    } catch (e) {
                        hint.textContent = '';
                    }
                });

                // 9. 回到顶部按钮监听
                window.addEventListener('scroll', () => {
                    const btn = document.getElementById('backToTop');
                    if (window.scrollY > 300) {
                        btn.style.display = 'flex';
                    } else {
                        btn.style.display = 'none';
                    }
                });
            }
        };

        document.addEventListener('DOMContentLoaded', () => app.init());
    </script>
    <style>
        .hover-scale { transition: transform 0.2s ease; }
        .hover-scale:hover { transform: scale(1.02); }
        .transition-all { transition: all 0.2s ease; }
        .cursor-pointer { cursor: pointer; }
        
        /* 横向滚动条美化 */
        .scrollbar-thin::-webkit-scrollbar { height: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        
        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .hover-red:hover { color: #ef4444 !important; }
        .fw-black { font-weight: 900; }
    </style>
</body>
</html>`

export const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN" data-bs-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Uptime Pro | Login</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/js-sha256@0.9.0/src/sha256.min.js"></script>
  <style>
    body { 
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
      background-color: #000; 
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-card {
      background: rgba(255, 255, 255, 0.02);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 2rem;
      padding: 3rem;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      position: relative;
    }
    .lang-toggle {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
    }
    .form-control {
      background-color: #09090b !important;
      border: 1px solid rgba(255, 255, 255, 0.1) !important;
      color: #fff !important;
      border-radius: 1rem;
      padding: 0.8rem 1.2rem;
    }
    .form-control:focus {
      border-color: #10b981 !important;
      box-shadow: 0 0 0 0.25rem rgba(16, 185, 129, 0.25);
    }
    .btn-primary {
      background-color: #10b981;
      border: none;
      border-radius: 1rem;
      padding: 0.8rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    .btn-primary:hover {
      background-color: #059669;
    }
    canvas {
      border-radius: 1rem;
      cursor: pointer;
      background: #111;
      width: 100%;
      height: 50px;
    }
    .brand {
      font-weight: 900;
      letter-spacing: -0.05em;
      font-size: 2.5rem;
      color: #f8fafc;
    }
    .brand span {
      color: #10b981;
    }
    .subtitle {
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.3em;
      color: #fbbf24;
      margin-bottom: 2.5rem;
    }
    .form-label {
      color: #c084fc !important;
    }
    .btn-primary {
      background-color: #10b981;
      border: none;
      border-radius: 1rem;
      padding: 0.8rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="login-card text-center">
    <div class="lang-toggle">
      <button onclick="toggleLang()" class="btn btn-link text-secondary text-decoration-none small fw-bold text-uppercase tracking-wider p-0" id="langBtn">中文</button>
    </div>
    <div class="brand mb-1">UPTIME<span>PRO</span></div>
    <div class="subtitle" id="subtitle">ADMIN ACCESS</div>
    
    <div id="errorAlert" class="alert alert-danger d-none mb-4 py-2 small" role="alert"></div>

    <form id="loginForm">
      <div class="mb-3 text-start">
        <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelUser">Username</label>
        <input type="text" id="username" class="form-control" required autocomplete="username">
      </div>
      <div class="mb-3 text-start">
        <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelPass">Password</label>
        <input type="password" id="password" class="form-control" required autocomplete="current-password">
      </div>
      <div class="mb-4 text-start">
        <label class="form-label small fw-bold text-secondary text-uppercase tracking-wider ms-1" id="labelCaptcha">Captcha</label>
        <div class="row g-2">
          <div class="col-7">
            <input type="text" id="captcha" class="form-control text-center text-uppercase" required placeholder="CODE">
          </div>
          <div class="col-5">
            <canvas id="captchaCanvas" onclick="refreshCaptcha()"></canvas>
          </div>
        </div>
      </div>
      <button type="submit" class="btn btn-primary w-100 shadow-sm" id="loginBtn">
        Unlock Dashboard
      </button>
    </form>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    let captchaId = '';
    let currentLang = 'cn';

    const i18n = {
      en: {
        subtitle: 'ADMIN ACCESS',
        labelUser: 'Username',
        labelPass: 'Password',
        labelCaptcha: 'Captcha',
        loginBtn: 'Unlock Dashboard',
        langBtn: '中文',
        loginFailed: 'Login Failed',
        networkError: 'Network Error',
        captchaExpired: 'Captcha Expired',
        captchaError: 'Captcha Error',
        fetchCaptchaFailed: 'Failed to fetch captcha'
      },
      cn: {
        subtitle: '管理员访问',
        labelUser: '用户名',
        labelPass: '密码',
        labelCaptcha: '验证码',
        loginBtn: '解锁控制面板',
        langBtn: 'ENGLISH',
        loginFailed: '登录失败',
        networkError: '网络错误',
        captchaExpired: '验证码已过期',
        captchaError: '验证码错误',
        fetchCaptchaFailed: '获取验证码失败'
      }
    };

    function t(key) {
      return i18n[currentLang][key] || key;
    }

    function updateUI() {
      document.getElementById('subtitle').textContent = t('subtitle');
      document.getElementById('labelUser').textContent = t('labelUser');
      document.getElementById('labelPass').textContent = t('labelPass');
      document.getElementById('labelCaptcha').textContent = t('labelCaptcha');
      document.getElementById('loginBtn').textContent = t('loginBtn');
      document.getElementById('langBtn').textContent = t('langBtn');
    }

    function toggleLang() {
      currentLang = currentLang === 'en' ? 'cn' : 'en';
      localStorage.setItem('lang', currentLang);
      document.cookie = "lang=" + currentLang + "; path=/; max-age=31536000";
      updateUI();
    }

    function drawCaptcha(text) {
      const canvas = document.getElementById('captchaCanvas');
      const ctx = canvas.getContext('2d');
      // 调整 canvas 实际像素以匹配显示大小
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      for (let i = 0; i < text.length; i++) {
        const r = Math.floor(Math.random() * 100 + 155);
        const g = Math.floor(Math.random() * 100 + 155);
        const b = Math.floor(Math.random() * 100 + 155);
        ctx.fillStyle = \`rgb(\${r},\${g},\${b})\`;
        ctx.save();
        const x = (canvas.width / (text.length + 1)) * (i + 1);
        const y = canvas.height / 2 + (Math.random() - 0.5) * 10;
        ctx.translate(x, y);
        ctx.rotate((Math.random() - 0.5) * 0.4);
        ctx.fillText(text[i], 0, 0);
        ctx.restore();
      }
      
      for(let i=0; i<30; i++) {
        ctx.fillStyle = \`rgba(255,255,255,0.1)\`;
        ctx.beginPath();
        ctx.arc(Math.random()*canvas.width, Math.random()*canvas.height, 1, 0, Math.PI*2);
        ctx.fill();
      }
    }

    async function refreshCaptcha() {
      try {
        const errorAlert = document.getElementById('errorAlert');
        errorAlert.classList.add('d-none');
        const res = await fetch('/captcha');
        const data = await res.json();
        if (res.ok) {
          captchaId = data.captchaId;
          drawCaptcha(data.captchaText);
        } else {
          errorAlert.textContent = data.error || t('fetchCaptchaFailed');
          errorAlert.classList.remove('d-none');
        }
      } catch (e) {
        console.error('Failed to fetch captcha');
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      updateUI();
      refreshCaptcha();
    });

    document.getElementById('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const errorAlert = document.getElementById('errorAlert');
      const loginBtn = document.getElementById('loginBtn');
      errorAlert.classList.add('d-none');
      
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();
      const captcha = document.getElementById('captcha').value.trim().toLowerCase();
      
      if (!captchaId) {
        errorAlert.textContent = t('captchaError');
        errorAlert.classList.remove('d-none');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + t('loginBtn');

      try {
        const passwordHash = sha256(password);
        const hashedCaptcha = sha256(captcha);
        // 使用 hashedCaptcha 作为盐值再次加密
        const hashedPassword = sha256(passwordHash + hashedCaptcha);

        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            username,
            hashedPassword,
            hashedCaptcha,
            captchaId
          })
        });
        const data = await res.json();
        if (res.ok && data.token){
           window.location.replace('/');
        } else {
          refreshCaptcha();
          errorAlert.textContent = data.error || t('loginFailed');
          errorAlert.classList.remove('d-none');
          loginBtn.disabled = false;
          loginBtn.textContent = t('loginBtn');
        }
      } catch (err) {
        errorAlert.textContent = t('networkError');
        errorAlert.classList.remove('d-none');
        loginBtn.disabled = false;
        loginBtn.textContent = t('loginBtn');
      }
    };
  </script>
</body>
</html>`
export const NO_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>安全配置未完成 · Security Setup Required</title>
<style>
  body {
    margin: 0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #212529;
    color: #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .card {
    background: #1e293b;
    padding: 32px;
    border-radius: 16px;
    max-width: 680px;
    width: 90%;
    box-shadow: 0 0 40px rgba(0,0,0,0.4);
    border: 1px solid #334155;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 24px;
    color: #f8fafc;
  }
  p {
    line-height: 1.6;
    margin: 10px 0;
  }
  code {
    background: #0f172a;
    padding: 3px 6px;
    border-radius: 6px;
    border: 1px solid #334155;
    font-size: 13px;
  }
  .warn {
    color: #f87171;
    font-weight: 600;
  }
</style>
</head>
<body>
  <div class="card">
    <h1>⚠️ 安全配置未完成 · Security Setup Required</h1>
    <p class="warn">
  FIXED_PASSWORD 长度必须 ≥ 12 位。  
  FIXED_PASSWORD must be at least 12 characters long.
</p>

 
    <p>请在你的 <code>wrangler.jsonc vars</code>或 Cloudflare Secrets 中设置：</p>
    <p>前往 Cloudflare Workers 修改变量和机密<p>

    <p>
      <code>FIXED_USERNAME=your_admin</code><br />
      <code>FIXED_PASSWORD=your_strong_password</code>
    </p>
    <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
    <p class="warn">建议同时修改 CAPTCHA_SALT（验证码盐值）。</p>
 
    <p>完成配置后请重新部署服务。</p>
    <p>After updating the configuration, redeploy the service.</p>
  </div>
</body>
</html>
`
