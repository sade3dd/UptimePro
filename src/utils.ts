import type { Context, Next } from 'hono';

// 简单的缓存辅助函数
export async function cacheResponse(c: any, key: string, handler: () => Promise<Response>, ttlSeconds = 60) {
  const cache = caches.default;
  const req = new Request(key, { method: 'GET' });
  const cached = await cache.match(req);
  if (cached) return cached;

  const res = await handler();
  const cloned = res.clone();
  cloned.headers.set('Cache-Control', `max-age=${ttlSeconds}`);
  await cache.put(req, cloned);
  return res;
}
