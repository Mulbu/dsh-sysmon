# dsh-sysmon

A [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) Web UI plugin that shows
live **CPU** and **memory** usage for the machine running `dsh web`.

The readout renders as two pills inside the composer dock row — the same line that
carries the shipped `tok/s`, cache-hit and context-usage figures — placed to the
**right of the context meter**.

```
  ... 236 tok/s   缓存命中 97%   ◔ 7%   CPU ▮▮ 43%   内存 ▮ 73% 2.7/3.7 GiB
                                      └──────────── dsh-sysmon ────────────┘
```

## Features

- **CPU** — aggregate utilisation plus **one horizontal track per logical core**,
  stacked top to bottom, so a single busy core is visible even when the average
  looks calm. Hover a track for that core's exact percentage.
- **Memory** — percentage used plus `used/total` in GiB, from `/proc/meminfo`
  `MemAvailable` (a much better "used" signal than `os.freemem()`).
- **Colour bands** — every track turns amber at 65% and red at 85%.
- **Responsive** — the pills wrap onto a second line on narrow screens, and the
  per-core tracks stay visible at every width (below 480px the pills tighten and
  the byte pair is hidden). Nothing is ever clipped or overlapped.
- **Locale-aware** — Chinese and English dictionaries; follows the active UI
  locale and re-renders on switch.
- **Cheap** — one cached, single-flight, same-origin JSON route polled every 2s;
  polling pauses while the tab is hidden and resumes on focus.
- **Degrades quietly** — a failed request keeps the last numbers on screen
  (dimmed) instead of blanking the row.

## Install

Requires a DSH profile (the Web UI profile is usually `~/.dsh/profiles/web`).

```bash
# From the profile directory, add this package as a bundle:
pnpm add /absolute/path/to/dsh-sysmon
```

Then add it to the profile's bundle list in `package.json`:

```json
{
  "dsh": {
    "profile": {
      "bundles": ["...", "@local/dsh-sysmon"]
    }
  }
}
```

or install it through the plugin manager, which does both steps for you:

```text
plugin_manager install_bundle target=/absolute/path/to/dsh-sysmon
```

The bundle declares its own `cordis.patch.yml` (`dsh.bundle.patch`), so no manual
`cordis.patch.yml` edit is needed. Reload the Web UI page to pick up the client
half; the host half is hot-reloaded by HMR.

Because the profile links this directory (`link:` dependency), editing
`client.js` or `index.js` in place is picked up on the next page load — no
reinstall needed.

## How it works

Two halves, wired by the DSH bundle system.

### Host half — `index.js`

A Cordis plugin that registers one read-only route:

| Method | Path             | Response                          |
| ------ | ---------------- | --------------------------------- |
| GET    | `/dsh-sysmon/api` | JSON telemetry, `cache-control: no-store` |

Payload:

```json
{
  "ok": true,
  "cpuPercent": 53.6,
  "cpuCores": [57.8, 49.3],
  "cpuCount": 2,
  "loadAverage": [0.9, 1.1, 1.4],
  "memory": { "total": 4013531136, "used": 1609936896, "percent": 40.1 },
  "swap":   { "total": 4025479168, "used": 339214336, "percent": 8.4 },
  "uptime": 430046,
  "sampledAt": 1792598970410
}
```

- CPU percentages are **deltas between two samples** of the cumulative tick
  counters in `os.cpus()`, so the first request after boot returns `null` for the
  CPU fields until a baseline exists. Aggregate and per-core figures come from
  the same snapshot, so the total is always the sum of the cores beside it.
- A hot-plugged CPU changes the core count; only the shared prefix is compared
  and the aggregate is still reported.
- Responses are cached for 500ms behind a single-flight guard, so several open
  tabs cannot skew each other's deltas.
- The route enforces a same-origin fence (Host present, no
  `sec-fetch-site: cross-site`, `Origin` must match `Host`) and answers `403` /
  `405` / `500` appropriately.

### Client half — `client.js`

A browser bundle loaded through `window.__ModuleLoader__` that:

1. Registers a `zh`/`en` locale dictionary under the `dsh-sysmon` namespace.
2. Registers one entry in the **`conversation.composer.dock`** slot (id
   `dsh-sysmon`, `order: 10`, after the shipped `stats` entry).
3. Renders the two pills and polls the host route.

Two layout details are load-bearing:

- The context meter is **not** a slot entry — `InputBar` renders it *after* the
  dock outlet, so every slot entry would sit to its left. The bundle sets
  `order: 1` on its own element, which lifts it past the meter (default
  `order: 0`). The outlet wrapper is `display: contents`, so the element is a
  direct flex item of the dock row and `order` applies.
- The shipped dock row is `display: flex` with **no** `flex-wrap`, so a row that
  is too wide *shrinks* its items instead of breaking the line. Marking the row
  itself is the only real fix: a mount effect walks up to the nearest ancestor
  that computes to a flex container (skipping the `display: contents` slot
  wrappers) and sets `data-dsh-sysmon-row` on it, whose rule turns on
  `flex-wrap`. The attribute is removed on unmount, so the row returns to its
  shipped behaviour when the plugin unloads.

## Files

| File                | Role                                                  |
| ------------------- | ----------------------------------------------------- |
| `package.json`      | Bundle manifest: `dsh.bundle.patch`, `dsh.client`      |
| `cordis.patch.yml`  | Loader row that inserts `@local/dsh-sysmon`            |
| `index.js`          | Host half: the `/dsh-sysmon/api` route                 |
| `client.js`         | Client half: locale, slot entry, pills, polling        |

## Uninstall

```text
plugin_manager set_plugin target=@local/dsh-sysmon enabled=false
```

or remove `@local/dsh-sysmon` from the profile's `dsh.profile.bundles` and
`pnpm remove` it. The route disappears with the host plugin and the pills with
the client entry — nothing else is touched.

## License

MIT
