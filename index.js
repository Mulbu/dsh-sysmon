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
import { readdir, readFile, statfs } from 'node:fs/promises';

const ROUTE_PREFIX = '/dsh-sysmon/api';
/**
 * Filesystem whose usage the disk pill reports: the one holding the process's
 * working directory, which is the deployment's own volume. Resolved once so a
 * chdir elsewhere cannot silently switch the pill to a different disk.
 */
const DISK_PATH = process.cwd();
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
 * Which logical CPU is which hardware thread, resolved once at startup.
 * @type {{ logical: number, core: number, thread: number }[] | undefined}
 */
let topology;

/**
 * Resolve the SMT layout so the client can draw one COLUMN per hardware thread
 * and one ROW per physical core: on a 2-core/4-thread box that is two columns
 * (primary threads, then siblings) of two rows each.
 *
 * Linux exposes the answer directly in sysfs (`core_id` + `physical_package_id`
 * per logical CPU). Everywhere else — macOS, Windows, containers without the
 * sysfs topology — there is no portable equivalent, so this returns undefined
 * and the client falls back to one track per logical CPU in a single column.
 *
 * @returns {Promise<{ logical: number, core: number, thread: number }[] | undefined>}
 *   one entry per logical CPU, ordered THREAD-major (all thread 0 rows, then all
 *   thread 1 rows, …) so a column-major CSS grid lays it out one column per
 *   thread; undefined when the platform does not expose the topology.
 */
async function readTopology() {
  try {
    const names = await readdir('/sys/devices/system/cpu');
    const present = names
      .map((name) => /^cpu(\d+)$/.exec(name))
      .filter((match) => match !== null)
      .map((match) => Number(match[1]))
      .sort((a, b) => a - b);
    if (present.length === 0) return undefined;

    // Group logical CPUs by (package, core). Each group lists the logical CPUs
    // that share one physical core: index 0 is the primary thread, index 1+ are
    // its SMT siblings.
    const groups = [];
    const byKey = new Map();
    for (const logical of present) {
      const base = `/sys/devices/system/cpu/cpu${logical}/topology`;
      const [coreId, packageId] = await Promise.all([
        readFile(`${base}/core_id`, 'utf8'),
        readFile(`${base}/physical_package_id`, 'utf8'),
      ]);
      const key = `${packageId.trim()}:${coreId.trim()}`;
      let index = byKey.get(key);
      if (index === undefined) {
        index = groups.length;
        byKey.set(key, index);
        groups.push([]);
      }
      groups[index].push(logical);
    }

    // Reorder thread-major: every core's thread 0, then every core's thread 1,
    // and so on. A core with fewer threads than the widest one simply has no
    // row in the later columns, which is exactly the grid the client wants.
    const width = groups.reduce((max, members) => Math.max(max, members.length), 0);
    const rows = [];
    for (let thread = 0; thread < width; thread += 1) {
      groups.forEach((members, core) => {
        const logical = members[thread];
        if (logical === undefined) return;
        rows.push({ logical, core, thread });
      });
    }
    return rows;
  } catch {
    return undefined;
  }
}

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

/**
 * Disk usage of the filesystem that holds this deployment, reported the same
 * way as memory: a used/total pair plus a percentage.
 *
 * `statfs` is used rather than shelling out to `df` because it needs no child
 * process and is available on every platform Node runs on. `bavail` (free space
 * for unprivileged users) is deliberately not the "free" figure here: `used` is
 * `total - bfree` so it matches what `df` shows in the Used column.
 *
 * @param {string} path - a path on the filesystem to measure.
 * @returns {Promise<{ path: string, total: number, used: number, percent: number } | null>}
 *   null when the filesystem cannot be measured.
 */
async function readDisk(path) {
  try {
    const stats = await statfs(path);
    const total = stats.bsize * stats.blocks;
    if (!Number.isFinite(total) || total <= 0) return null;
    const used = Math.max(0, total - stats.bsize * stats.bfree);
    return {
      path,
      total,
      used,
      percent: round((used / total) * 100),
    };
  } catch {
    return null;
  }
}

/** Round to one decimal place. */
function round(value) {
  return Number(value.toFixed(1));
}

/**
 * One hwmon temperature reading: the chip name, its label, and Celsius.
 * @typedef {{ chip: string, label: string, celsius: number }} TemperatureReading
 */

/**
 * Read every readable `tempN_input` under `/sys/class/hwmon`, in sysfs order.
 *
 * Three things make this less trivial than a glob:
 *  1. The hwmon INDEX is not stable across boots, so chips are identified by
 *     their `name` file (`coretemp`, `acpitz`, `k10temp`, …) and never by path.
 *  2. Not every `tempN_input` has a `tempN_label`, and a missing label must not
 *     drop the reading.
 *  3. A driver can expose a sensor that is not connected: a raw value of 0, a
 *     negative value, or one above 150 °C is not a real CPU temperature, and
 *     reporting it would peg the bar at red for no reason.
 *
 * @param {string} root - `/sys/class/hwmon` in production; injectable for tests.
 * @returns {Promise<TemperatureReading[]>} readings; empty when unavailable.
 */
async function readTemperatures(root = '/sys/class/hwmon') {
  let entries;
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const read = async (dir, file) => {
    try {
      return (await readFile(`${dir}/${file}`, 'utf8')).trim();
    } catch {
      return undefined;
    }
  };

  const readings = [];
  for (const entry of entries) {
    const dir = `${root}/${entry}`;
    const chip = (await read(dir, 'name')) ?? entry;
    let children;
    try {
      children = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of children) {
      const match = /^temp(\d+)_input$/.exec(file);
      if (match === null) continue;
      const milli = Number(await read(dir, file));
      // `tempN_input` is millidegrees Celsius by the hwmon ABI.
      if (!Number.isFinite(milli) || milli <= 0) continue;
      const celsius = milli / 1000;
      if (celsius > 150) continue;
      const label = (await read(dir, `temp${match[1]}_label`)) ?? '';
      readings.push({ chip, label, celsius });
    }
  }
  return readings;
}

/**
 * Choose the CPU package temperature out of the available readings.
 *
 * `coretemp`/`k10temp` expose a labelled package sensor, which is exactly the
 * die temperature a "CPU temp" bar should show. When the chip is absent (an ARM
 * SBC, a VM) fall back to the HOTTEST reading: an overheating box must read hot
 * even when the sensor that reported it is not the package one, and a chassis
 * sensor reports a calm ambient that would hide the problem.
 *
 * @param {TemperatureReading[]} readings - all readings, in sysfs order.
 * @returns {{ celsius: number, chip: string, label: string } | null} the pick.
 */
function pickCpuTemperature(readings) {
  const packageSensor = readings.find((entry) => /package/i.test(entry.label));
  const picked = packageSensor ?? readings.reduce(
    (best, entry) => (best === null || entry.celsius > best.celsius ? entry : best),
    null,
  );
  return picked === null
    ? null
    : { celsius: picked.celsius, chip: picked.chip, label: picked.label };
}

/**
 * Topology, resolved lazily on first use and then memoized. Doing it here rather
 * than only in `apply` matters because the host half is loaded once per process:
 * a hot-reloaded or long-running module keeps its module state, and a plugin
 * installed before this feature existed would otherwise never report a layout.
 * @returns {Promise<{ logical: number, core: number, thread: number }[] | null>}
 */
async function topologyOnce() {
  if (topology === undefined) topology = await readTopology();
  return topology ?? null;
}

/** Build the payload the Client half polls. */
async function collect() {
  const [cpu, memory, layout, disk, temperatures] = await Promise.all([
    Promise.resolve().then(sampleCpu),
    readMemory(),
    topologyOnce(),
    readDisk(DISK_PATH),
    readTemperatures(),
  ]);

  const used = Math.max(0, memory.total - memory.available);
  const swapUsed = Math.max(0, memory.swapTotal - memory.swapFree);
  const temperature = pickCpuTemperature(temperatures);

  return {
    cpuPercent: cpu.percent === undefined ? null : cpu.percent,
    cpuCores: cpu.cores ?? null,
    // Thread layout when it is known, so the client can put one column per
    // hardware thread and one row per physical core. Null means "unknown on
    // this platform" and the client falls back to a single column.
    cpuTopology: layout,
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
    // The filesystem holding this deployment; null when it cannot be measured.
    disk: disk === null ? null : disk,
    // CPU die temperature; null when no readable sensor exists (a VM, a board
    // without hwmon), so the client can omit the bar instead of showing `--`.
    temperature: temperature === null
      ? null
      : {
          celsius: round(temperature.celsius),
          chip: temperature.chip,
          label: temperature.label,
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

  // Warm the topology cache in the background so the first poll already has it;
  // `collect()` resolves it on demand anyway, so a failure here is harmless.
  void topologyOnce();

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
