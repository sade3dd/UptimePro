import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import type { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { LOGIN_HTML} from "./ui.js";
import { cacheResponse } from './utils.js';
import { compress } from 'hono/compress';
// 定义无需认证的路由
export const UNAUTH_ROUTES = {
  CAPTCHA: '/captcha',
  LOGIN: '/login',
  LOGOUT: '/scdfdsferty456ghfhSASkkxjdsiufs8d880d9d9fjjJUUS8-8JJ_SXJK_cs/',
} as const;

// 定义数据结构
interface CaptchaData {
  hashedCaptcha: string;
  expectedLoginHash: string;
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


  admin: {
    username: string;
    passwordHash: string;
  }
} | undefined;
// ===== 输入安全检查工具 =====

function isSafeString(v: any, maxLen = 128): v is string {
  if (typeof v !== 'string') return false;
  if (v.length === 0 || v.length > maxLen) return false;

  // 禁止控制字符（0x00 - 0x1F）
  if (/[\x00-\x1F]/.test(v)) return false;

  return true;
}

// 用户名：中英文 + 数字 + 下划线 + 横线
const usernamePattern = /^[\u4e00-\u9fa5A-Za-z0-9_-]{1,32}$/;

// 哈希字段（base64 / hex）
const hashPattern = /^[A-Za-z0-9+/=]+$/;

// 安全 ID（captchaId）
const idPattern = /^[A-Za-z0-9_-]{1,64}$/


// 初始化全局存储的辅助函数
async function ensureStore(env: any) {
  const currentUsername = env.FIXED_USERNAME || 'admin';
  const currentPassword = env.FIXED_PASSWORD || 'password';
  const currentHashedPassword = await hashWithSubtle(currentPassword);

  if (!globalStore) {
    globalStore = {
      captcha: new Map<string, CaptchaData>(),
      requestTimestamps: new Map<string, number[]>(),

      admin: {
        username: currentUsername,
        passwordHash: currentHashedPassword
      }
    };
  } else {
    // 如果环境变量更新了，更新内存中的 admin 数据
    if (globalStore.admin.username !== currentUsername || globalStore.admin.passwordHash !== currentHashedPassword) {
      globalStore.admin = {
        username: currentUsername,
        passwordHash: currentHashedPassword
      };
    }
  }
}

// 创建 Hono 实例
const auth = new Hono<{ Bindings: { MONITOR_ENGINE: any; FIXED_USERNAME?: string; FIXED_PASSWORD?: string; JWT_SECRET?: string; CAPTCHA_SALT?: string } }>();
// 全局安全头中间件


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

const globalLimiter = createRateLimiter(3 * 1000, 1, 'global');
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

export async function isAuthenticated(request: Request, JWT_SECRET: string): Promise<boolean> {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.split(";").find(c => c.trim().startsWith("token="))?.split("=")[1];
  if (!token) return false;

  const jwtSecret = JWT_SECRET || 'k1PtweQ69UBRzdOIla2n6AJf9ovp3TvFBhvbeUIOxSmCEPOvQwfRGBuzeaHwKfjNIJb7JtaEruvYkjPUp5eZpZ';

  try {
    const payload = await verify(token, jwtSecret, 'HS256');

    // 验证 IP 是否匹配
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const hashedIP = await hashWithSubtle(ip);


    return payload && payload.sub === 'admin' && payload.ip === hashedIP;
  } catch (e) {
    return false;
  }
}


auth.get('/login', (c: Context) => {
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net; object-src 'none';");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  return cacheResponse(c, c.req.url, async () => c.html(LOGIN_HTML), 300);

});
auth.get('/captcha', captchaLimiter, async (c: Context) => {
  await ensureStore(c.env);
  const captchaSalt = c.env.CAPTCHA_SALT || '';
  const captchaText = generateCaptcha();
  const captchaId = 'latest';
  const saltedHashedCaptcha = await hashWithSubtle((captchaText + captchaSalt).toLowerCase());

  // 使用内存中的 admin 数据
  const storedPasswordHash = globalStore!.admin.passwordHash;
  const expectedLoginHash = await hashWithSubtle(storedPasswordHash + saltedHashedCaptcha);

  // 存入内存
  globalStore!.captcha.set(captchaId, {
    hashedCaptcha: saltedHashedCaptcha,
    expectedLoginHash,
    text: captchaText,
    expires: Date.now() + 5 * 60 * 1000,
  });
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net; object-src 'none';");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return c.json({ captchaId, captchaText });
});

auth.post('/login', globalLimiter, async (c: Context) => {
  try {
    await ensureStore(c.env);

    // 限制 Body 大小（防止大包攻击）
    const contentLength = Number(c.req.header('Content-Length') || 0);
    if (contentLength > 10 * 1024) {
      return c.json({ error: '请求体过大' }, 429);
    }

    const body: any = await c.req.parseBody();
    let { username, hashedPassword, hashedCaptcha, captchaId } = body;
    // ===== 输入安全检查 =====

    if (!isSafeString(username, 128) || !usernamePattern.test(username)) {
      return c.json({ error: '非法用户名' }, 429);
    }

    if (!isSafeString(hashedPassword, 128) || !hashPattern.test(hashedPassword)) {
      return c.json({ error: '非法密码格式' }, 429);
    }

    if (!isSafeString(hashedCaptcha, 128) || !hashPattern.test(hashedCaptcha)) {
      return c.json({ error: '非法验证码格式' }, 429);
    }

    if (!isSafeString(captchaId, 64) || !idPattern.test(captchaId)) {
      return c.json({ error: '非法验证码ID' }, 429);
    }

    if (!username || !hashedPassword || !hashedCaptcha || !captchaId) {
      return c.json({ error: '用户名、密码和验证码不能为空' }, 429);
    }

    const storedCaptcha = globalStore!.captcha.get(captchaId);
    if (!storedCaptcha || storedCaptcha.expires <= Date.now()) {
      globalStore!.captcha.delete(captchaId);
      return c.json({ error: '验证码已过期' }, 429);
    }

    if (storedCaptcha.hashedCaptcha !== hashedCaptcha) {
      globalStore!.captcha.delete(captchaId);
      return c.json({ error: '验证码错误' }, 429);
    }

    const storedUsername = globalStore!.admin.username;

    // 验证用户名和结合了验证码盐值的密码哈希
    if (username !== storedUsername || hashedPassword !== storedCaptcha.expectedLoginHash) {
      return c.json({ error: '无效的用户名或密码' }, 429);
    }

    // 登录成功后，清理验证码
    globalStore!.captcha.delete(captchaId);

    // 获取并加密用户 IP
    const ip = c.req.header('CF-Connecting-IP') || '';
    const hashedIP = await hashWithSubtle(ip);

    const jwtSecret = c.env.JWT_SECRET || 'k1PtweQ69UBRzdOIla2n6AJf9ovp3TvFBhvbeUIOxSmCEPOvQwfRGBuzeaHwKfjNIJb7JtaEruvYkjPUp5eZpZ';


    const payload = {
      sub: 'admin',
      ip: hashedIP, // 将加密后的 IP 存入 payload
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    };
    const token = await sign(payload, jwtSecret);

    setCookie(c, 'token', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60,
    });
    c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net; object-src 'none';");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("X-XSS-Protection", "1; mode=block");
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    return c.json({ token });
  } catch (err) {
    return c.json({ error: '服务器错误' + err }, 500);
  }
});

auth.get(UNAUTH_ROUTES.LOGOUT, async (c: Context) => {
  setCookie(c, 'token', '', {
    path: '/',
    maxAge: 0,
  });
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://cdn.jsdelivr.net; object-src 'none';");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return c.redirect('/login');
});

export default auth;
