/**
 * Host half of the system-monitor bundle.
 *
 * Exposes one read-only same-origin JSON route that reports live CPU and memory
 * usage of this machine. The Client half renders the numbers as pills in the
 * composer dock row of the Web UI.
 *
 * Sampling is portable: CPU comes from `os.cpus()` cumulative tick counters
 * (Linux and macOS), memory prefers `/proc/meminfo` because `MemAvailable` is a
 * far better "used" signal than `os.freemem()`, and falls back to `os` totals
 * elsewhere.
 */

import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os';
import { readFile } from 'node:fs/promises';

const ROUTE_PREFIX = '/dsh-sysmon/api';
/** Reuse one sample for this long so overlapping requests cannot skew the delta. */
const CACHE_MS = 500;
const GIB = 1024 * 1024 * 1024;

/** Per-core CPU tick counters of the previous sample, indexed by logical CPU. */
let previousTicks;
/** Last response payload, reused inside {@link CACHE_MS}. */
let cached;
let cachedAt = 0;
/** Single-flight guard for concurrent requests. */
let inflight;

/**
 * Per-core busy/idle tick counters, one entry per logical CPU, in `os.cpus()`
 * order. Total and per-core figures come from the SAME snapshot so the aggregate
 * stays the exact sum of the cores shown beside it.
 * @returns {{ busy: number, idle: number }[]} one pair per logical CPU.
 */
function readTicksPerCore() {
  return cpus().map((cpu) => {
    const t = cpu.times;
    return { busy: t.user + t.nice + t.sys + t.irq, idle: t.idle };
  });
}

/** Busy-idle delta as a clamped percentage; `undefined` without a usable delta. */
function percentOf(busyDelta, idleDelta) {
  const total = busyDelta + idleDelta;
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return Math.min(100, Math.max(0, (busyDelta / total) * 100));
}

/**
 * CPU usage since the previous sample, aggregated and per core.
 * @returns {{ percent?: number, cores?: number[] }} `percent`/`cores` are
 *   `undefined` until a baseline exists.
 */
function sampleCpu() {
  const current = readTicksPerCore();
  const previous = previousTicks;
  previousTicks = current;
  if (previous === undefined) return {};
  // A hot-plugged CPU changes the array length: compare only the shared prefix
  // and report the new aggregate rather than pairing unrelated cores.
  const cores = [];
  let busyDelta = 0;
  let idleDelta = 0;
  for (let i = 0; i < current.length; i += 1) {
    const before = previous[i];
    if (before === undefined) continue;
    const busy = current[i].busy - before.busy;
    const idle = current[i].idle - before.idle;
    busyDelta += busy;
    idleDelta += idle;
    const percent = percentOf(busy, idle);
    // A core with no usable delta still occupies its slot so the client keeps
    // one bar per core; it renders as unavailable there.
    cores.push(percent === undefined ? null : round(percent));
  }
  const percent = percentOf(busyDelta, idleDelta);
  return {
    percent: percent === undefined ? undefined : round(percent),
    cores,
  };
}

/** Parse `/proc/meminfo` into a key -> bytes map. */
function parseMeminfo(text) {
  const values = new Map();
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z_()]+):\s+(\d+)/.exec(line);
    if (!match) continue;
    values.set(match[1], Number(match[2]) * 1024);
  }
  return values;
}

/** Memory totals, preferring `/proc/meminfo` when present. */
async function readMemory() {
  try {
    const info = parseMeminfo(await readFile('/proc/meminfo', 'utf8'));
    const total = info.get('MemTotal');
    if (total === undefined || total <= 0) throw new Error('no MemTotal');
    const available = info.get('MemAvailable') ?? info.get('MemFree') ?? 0;
    const swapTotal = info.get('SwapTotal') ?? 0;
    const swapFree = info.get('SwapFree') ?? 0;
    return {
      total,
      available,
      swapTotal,
      swapFree,
    };
  } catch {
    return {
      total: totalmem(),
      available: freemem(),
      swapTotal: 0,
      swapFree: 0,
    };
  }
}

/** Round to one decimal place. */
function round(value) {
  return Number(value.toFixed(1));
}

/** Build the payload the Client half polls. */
async function collect() {
  const [cpu, memory] = await Promise.all([Promise.resolve().then(sampleCpu), readMemory()]);

  const used = Math.max(0, memory.total - memory.available);
  const swapUsed = Math.max(0, memory.swapTotal - memory.swapFree);

  return {
    cpuPercent: cpu.percent === undefined ? null : cpu.percent,
    cpuCores: cpu.cores ?? null,
    cpuCount: cpus().length,
    loadAverage: loadavg().map(round),
    memory: {
      total: memory.total,
      used,
      percent: memory.total > 0 ? round((used / memory.total) * 100) : 0,
    },
    swap: {
      total: memory.swapTotal,
      used: swapUsed,
      percent: memory.swapTotal > 0 ? round((swapUsed / memory.swapTotal) * 100) : 0,
    },
    uptime: Math.round(uptime()),
    sampledAt: Date.now(),
  };
}

/** Cached, single-flight wrapper around {@link collect}. */
async function snapshot() {
  const now = Date.now();
  if (cached !== undefined && now - cachedAt < CACHE_MS) return cached;
  if (inflight === undefined) {
    inflight = collect().finally(() => {
      inflight = undefined;
    });
  }
  cached = await inflight;
  cachedAt = Date.now();
  return cached;
}

/** Read one header value case-insensitively. */
function header(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Same-origin fence: reject cross-site callers and Origin/Host mismatches.
 * The payload is not sensitive, but keeping the route same-origin avoids
 * turning the plugin into a cross-site resource.
 */
function isSameOriginRequest(request) {
  const host = header(request.headers, 'host');
  if (host === undefined) return false;
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false;
  const origin = header(request.headers, 'origin');
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Write one JSON response with no caching. */
function writeJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Route handler for `GET /dsh-sysmon/api`. */
async function handler(req, res) {
  if (!isSameOriginRequest(req)) {
    writeJson(res, 403, { ok: false, message: 'forbidden' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end();
    return;
  }
  try {
    const payload = await snapshot();
    writeJson(res, 200, { ok: true, ...payload });
  } catch (error) {
    writeJson(res, 500, {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Cordis plugin name; matches the `cordis.patch.yml` entry id. */
export const name = 'dsh-sysmon';

/**
 * Cordis host plugin entry. The HTTP route only exists in web deployments, so a
 * pure-conversation deployment simply keeps the plugin idle.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  // Prime the CPU delta so the first request already reports a real number.
  try {
    previousTicks = readTicksPerCore();
  } catch {
    previousTicks = undefined;
  }

  if (typeof ctx.inject !== 'function') return;

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      try {
        return webCtx.webServer.register({
          kind: 'prefix',
          path: ROUTE_PREFIX,
          handler,
        });
      } catch (error) {
        // A deployment that already owns this path must not break activation:
        // the Client half simply reports `--` while the route is missing.
        ctx.logger?.warn?.(`dsh-sysmon: could not register ${ROUTE_PREFIX}`, error);
        return () => {};
      }
    }, 'dsh-sysmon: /dsh-sysmon/api');
  });
}
