import { execSync } from "child_process";
import crypto from "crypto";

// 判断是否是 dev 环境
const isDev = process.env.WRANGLER_COMMAND === "dev";
if (isDev) {
  console.log("Skipping secret generation in dev mode.");
  process.exit(0);
}

// 生成 96 字符 hex secret
function generateHex96() {
  return crypto.randomBytes(48).toString("hex");
}

// 自动生成的 secret
const jwtSecret = generateHex96();
const secureKey = crypto.randomUUID();

// 写入 Cloudflare Secrets（统一封装）
function putSecret(key, value) {
  if (!value) {
    console.log(`Skipping empty secret: ${key}`);
    return;
  }
  execSync(`echo "${value}" | wrangler secret put ${key}`, { stdio: "inherit" });
}

// 自动写入
putSecret("JWT_SECRET", jwtSecret);
putSecret("SECURE_KEY", secureKey);

console.log("Secrets updated successfully.");
