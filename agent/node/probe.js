// probe.js — index.js 引入即可自动运行
const os = require("os");
const fs = require("fs");
const { execSync } = require("child_process");
const WebSocket = require("ws");

// 固定配置
const ADDR = "wss://winter-art-1d44.ddws3f.workers.dev/probe?id=3b6aa121-3b51-49f6-b4ca-ca041711005b&key=o2K8uA60eyJd8q3BvFtshnTdEgKitCGUt7H04HDm3GDfT6Ylc1Bde0u8xp2du0z2";
const NAME = "hidencloud";

// ------------------ CPU ------------------
function cpuPercent() {
  const cpus = os.cpus();
  let idle = 0, total = 0;

  cpus.forEach(cpu => {
    for (let t in cpu.times) total += cpu.times[t];
    idle += cpu.times.idle;
  });

  return 100 - (idle / total * 100);
}

// ------------------ Load ------------------
function getLoad() {
  const [l1, l5, l15] = os.loadavg();
  return [l1, l5, l15];
}

// ------------------ Memory ------------------
function getMemory() {
  return {
    total: os.totalmem(),
    used: os.totalmem() - os.freemem()
  };
}

// ------------------ Disk（真实 df） ------------------
function getDisk() {
  try {
    const out = execSync("df -kP /").toString().trim().split("\n");
    const parts = out[1].split(/\s+/);

    const totalKB = parseInt(parts[1], 10);
    const usedKB = parseInt(parts[2], 10);

    return {
      total: totalKB * 1024,
      used: usedKB * 1024
    };
  } catch {
    return { total: 0, used: 0 };
  }
}

// ------------------ Network（真实 /proc/net/dev） ------------------
let lastNet = null;
let lastTime = null;

function readNetDev() {
  try {
    const text = fs.readFileSync("/proc/net/dev", "utf8");
    const lines = text.trim().split("\n").slice(2);

    let rx = 0, tx = 0;

    for (const line of lines) {
      const parts = line.replace(/:/, " ").trim().split(/\s+/);
      const iface = parts[0];
      if (iface === "lo") continue;

      rx += parseInt(parts[1], 10);
      tx += parseInt(parts[9], 10);
    }

    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

function getNetwork() {
  const now = Date.now();
  const { rx, tx } = readNetDev();

  let upSpeed = 0;
  let downSpeed = 0;

  if (lastNet && lastTime) {
    const dt = (now - lastTime) / 1000;
    if (dt > 0) {
      downSpeed = (rx - lastNet.rx) / dt;
      upSpeed = (tx - lastNet.tx) / dt;
    }
  }

  lastNet = { rx, tx };
  lastTime = now;

  return {
    up: upSpeed,
    down: downSpeed,
    total_up: tx,
    total_down: rx
  };
}

// ------------------ WebSocket ------------------
function startProbe() {
  console.log("[probe] Connecting...");

  const ws = new WebSocket(ADDR);

  ws.on("open", () => {
    console.log("[probe] Connected.");
  });

  ws.on("message", msg => {
    if (msg.toString() === "ping") ws.send("pong");
  });

  ws.on("close", () => {
    console.log("[probe] Connection lost, retrying...");
    setTimeout(startProbe, 5000);
  });

  ws.on("error", () => {});

  setInterval(() => {
    if (ws.readyState !== 1) return;

    const data = {
      cpu: cpuPercent(),
      load: getLoad(),
      mem: getMemory(),
      disk: getDisk(),
      net: getNetwork(),
      uptime: os.uptime()
    };

    ws.send(JSON.stringify({
      type: "server_stats",
      name: NAME,
      id: new URL(ADDR).searchParams.get("id"),
      key: new URL(ADDR).searchParams.get("key"),
      data
    }));
  }, 10000);
}

startProbe();
