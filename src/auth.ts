import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import type { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

// 定义无需认证的路由
export const UNAUTH_ROUTES = {
  CAPTCHA: '/captcha',
  LOGIN: '/login',
  LOGOUT: '/scdfdsferty456ghfhSASkkxjdsiufs8d880d9d9fjjJUUS8-8JJ_SXJK_cs/',
} as const;

// KV 操作类，封装对 Durable Object 的 RPC 调用
class KVStorage {
  private obj: any;
  constructor(env: any) {
    const id = env.MONITOR_ENGINE.idFromName("global_monitor");
    this.obj = env.MONITOR_ENGINE.get(id);
  }
  async get(key: string) { return await this.obj.kvGet(key); }
  async put(key: string, value: any) { await this.obj.kvPut(key, value); }
  async delete(key: string) { await this.obj.kvDelete(key); }
}

// 定义数据结构
interface CaptchaData {
  hashedCaptcha: string;
  text: string;
  expires: number;
}

interface UserData {
  hashedPassword: string;
}

// 全局存储
let globalStore: {
  captcha: Map<string, CaptchaData>;
  requestTimestamps: Map<string, number[]>;
} | undefined;

// 初始化全局存储的辅助函数
async function ensureStore(env: any) {
  const storage = new KVStorage(env);
  const currentUsername = env.FIXED_USERNAME || 'admin';
  const currentPassword = env.FIXED_PASSWORD || 'password';
  const currentHashedPassword = await hashWithSubtle(currentPassword);

  if (!globalStore) {
    globalStore = {
      captcha: new Map<string, CaptchaData>(),
      requestTimestamps: new Map<string, number[]>(),
    };
  }

  // 检查并更新持久化数据
  const storedUsername = await storage.get('admin:username');
  const storedPasswordHash = await storage.get('admin:passwordHash');

  // 如果环境变量更新了，或者存储中还没有数据，则更新存储
  if (storedUsername !== currentUsername || storedPasswordHash !== currentHashedPassword) {
    await storage.put('admin:username', currentUsername);
    await storage.put('admin:passwordHash', currentHashedPassword);
  }
}

// 创建 Hono 实例
const auth = new Hono<{ Bindings: { MONITOR_ENGINE: any; FIXED_USERNAME?: string; FIXED_PASSWORD?: string; JWT_SECRET?: string; CAPTCHA_SALT?: string } }>();

// 自定义速率限制器中间件
const createRateLimiter = (windowMs: number, limit: number, key: string) => {
  return async (c: Context, next: Next) => {
    await ensureStore(c.env);
    const now = Date.now();
    const timestamps = globalStore!.requestTimestamps.get(key) || [];
    const validTimestamps = timestamps.filter((ts) => now - ts < windowMs);
    validTimestamps.push(now);

    if (validTimestamps.length > limit) {
      return c.json({ error: `请求频率过高，请稍后再试` }, 429);
    }

    globalStore!.requestTimestamps.set(key, validTimestamps);
    return await next();
  };
};

const globalLimiter = createRateLimiter(3 * 1000,1, 'global');
const captchaLimiter = createRateLimiter(5 * 1000, 1, 'captcha');

async function hashWithSubtle(input: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateCaptcha(): string {
  const chars = '0123456789WERTYUPASDFGHJKZXCVBNM';
  let captcha = '';
  for (let i = 0; i < 6; i++) {
    captcha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return captcha;
}

export async function isAuthenticated(request: Request, env: any): Promise<boolean> {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.split(";").find(c => c.trim().startsWith("token="))?.split("=")[1];
  
  if (!token) return false;
  
  const jwtSecret = env.JWT_SECRET || 'k1PtweQ69UBRzdOIla2n6AJf9ovp3TvFBhvbeUIOxSmCEPOvQwfRGBuzeaHwKfjNIJb7JtaEruvYkjPUp5eZpZ';
  
  try {
    await verify(token, jwtSecret, 'HS256');
    
    const storage = new KVStorage(env);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const hashedIP = await hashWithSubtle(ip);
    const session = await storage.get("auth_session");
    
    return session && session.token === token && session.hashedIP === hashedIP;
  } catch (e) {
    return false;
  }
}

export function getLoginHtml(captchaSalt: string): string {
  return `
<!DOCTYPE html>
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
      const password = document.getElementById('password').value;
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
</html>
  `;
}
auth.get('/login', (c: Context) => {
  const captchaSalt = c.env.CAPTCHA_SALT || '';
  return c.html(getLoginHtml(captchaSalt));
});
auth.get('/captcha', captchaLimiter, async (c: Context) => {
  await ensureStore(c.env);
  const storage = new KVStorage(c.env);
  const captchaSalt = c.env.CAPTCHA_SALT || '';

  const captchaText = generateCaptcha();
  const captchaId = 'latest';
  const saltedHashedCaptcha = await hashWithSubtle((captchaText + captchaSalt).toLowerCase());

  // 获取当前存储的密码哈希，并结合 saltedHashedCaptcha 生成预期的登录哈希
  const storedPasswordHash = await storage.get('admin:passwordHash');
  const expectedLoginHash = await hashWithSubtle(storedPasswordHash + saltedHashedCaptcha);

  await storage.put('captcha:latest', {
    hashedCaptcha: saltedHashedCaptcha,
    expectedLoginHash,
    text: captchaText,
    expires: Date.now() + 5 * 60 * 1000,
  });

  return c.json({ captchaId, captchaText });
});

auth.post('/login', globalLimiter, async (c: Context) => {
  try {
    await ensureStore(c.env);
    const storage = new KVStorage(c.env);

    const jwtSecret = c.env.JWT_SECRET || 'k1PtweQ69UBRzdOIla2n6AJf9ovp3TvFBhvbeUIOxSmCEPOvQwfRGBuzeaHwKfjNIJb7JtaEruvYkjPUp5eZpZ';

    const body: any = await c.req.parseBody();
    let { username, hashedPassword, hashedCaptcha, captchaId } = body;

    if (!username || !hashedPassword || !hashedCaptcha || !captchaId) {
      return c.json({ error: '用户名、密码和验证码不能为空' }, 429);
    }

    const storedCaptcha = (await storage.get('captcha:latest')) as any;

    if (!storedCaptcha || storedCaptcha.expires <= Date.now()) {
      await storage.delete('captcha:latest');
      return c.json({ error: '验证码已过期' }, 429);
    }

    if (storedCaptcha.hashedCaptcha !== hashedCaptcha) {
      await storage.delete('captcha:latest');
      return c.json({ error: '验证码错误' }, 429);
    }

    const storedUsername = await storage.get('admin:username');
    
    // 验证用户名和结合了验证码盐值的密码哈希
    if (username !== storedUsername || hashedPassword !== storedCaptcha.expectedLoginHash) {
      return c.json({ error: '无效的用户名或密码' }, 429);
    }

    const payload = {
      sub: 'admin',
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    };
    const token = await sign(payload, jwtSecret);

    // 获取并加密用户 IP
    const ip = c.req.header('CF-Connecting-IP') || '';
    const hashedIP = await hashWithSubtle(ip);
    
    // 将 token 和加密后的 IP 存入 KV，实现单一登录
    await storage.put('auth_session', { token, hashedIP });

    setCookie(c, 'token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60,
    });

    return c.json({ token });
  } catch (err) {
    return c.json({ error: '服务器错误' }, 500);
  }
});

auth.get(UNAUTH_ROUTES.LOGOUT, async (c: Context) => {
  const cookie = c.req.header("Cookie") || "";
  const token = cookie.split(";").find(c => c.trim().startsWith("token="))?.split("=")[1];
  if (token) {
    const storage = new KVStorage(c.env);
    const session = await storage.get('auth_session');
    if (session && session.token === token) {
      await storage.delete('auth_session');
    }
  }
  setCookie(c, 'token', '', {
    path: '/',
    maxAge: 0,
  });
  return c.redirect('/login');
});

export default auth;
