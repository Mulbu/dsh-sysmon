window.__ModuleLoader__.load({
  id: '@local/dsh-sysmon',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this bundle. */
    const NS = 'dsh-sysmon';
    /** Slot id; must differ from every other `conversation.composer.dock` occupant. */
    const SLOT_ID = 'dsh-sysmon';
    /** Slot this bundle contributes to: the pill row directly under the composer card. */
    const SLOT_NAME = 'conversation.composer.dock';
    /** Poll interval of the read-only host route. */
    const POLL_MS = 2000;
    /** Request timeout so a hung sample cannot stall the loop. */
    const REQUEST_TIMEOUT_MS = 8000;
    /** Marks the shipped dock row while the pills are mounted, enabling wrap there. */
    const ROW_ATTR = 'data-dsh-sysmon-row';

    const zh = {
      'label.bar': '系统状态',
      'label.cpu': 'CPU',
      'label.core': '核心',
      'label.cores': '核心',
      'label.memory': '内存',
      'label.disk': '硬盘',
      'label.load': '负载',
      'label.temperature': '温度',
      'label.unavailable': '不可用',
      'tooltip.cores': '核心',
      'tooltip.disk': '硬盘',
      'tooltip.sensor': '传感器',
      'tooltip.swap': '交换分区',
      'tooltip.uptime': '运行时长',
    };

    const en = {
      'label.bar': 'System status',
      'label.cpu': 'CPU',
      'label.core': 'Core',
      'label.cores': 'Cores',
      'label.memory': 'MEM',
      'label.disk': 'DISK',
      'label.load': 'LOAD',
      'label.temperature': 'TEMP',
      'label.unavailable': 'unavailable',
      'tooltip.cores': 'cores',
      'tooltip.disk': 'disk',
      'tooltip.sensor': 'sensor',
      'tooltip.swap': 'swap',
      'tooltip.uptime': 'uptime',
    };

    /**
     * The composer dock is a centered flex row of pills, so this bundle renders
     * as two more pills in that row instead of claiming its own strip: same font
     * metrics, same tertiary label colour, same 12px gap as the shipped stats
     * pills, with a slim meter standing in for their icon glyph.
     *
     * The context meter is NOT a slot entry: `InputBar` renders it after the
     * `conversation.composer.dock` outlet, so every registered entry sits to its
     * left by DOM order. `order:1` lifts this element past the meter (which has
     * the default `order:0`), which is the only way a slot entry can land on its
     * right — the outlet wrapper is `display:contents`, so this element is a
     * direct flex item of the dock row.
     *
     * Wrapping cannot be solved from inside this element. The shipped dock row is
     * `display:flex` with no `flex-wrap`, so a too-wide row SHRINKS its items
     * instead of breaking the line; the shrink squeezed these pills into a narrow
     * column that overlapped the stats text. The fix is to mark the row itself
     * (`ROW_ATTR`, applied by the mount effect in `SysmonPills`) and let
     * the rule below turn on `flex-wrap` there. `flex-wrap:wrap` only reflows
     * when the content actually overflows, so desktop is unchanged.
     */
    const CSS = [
      `[${ROW_ATTR}]{flex-wrap:wrap;row-gap:4px}`,
      '[data-dsh-sysmon]{box-sizing:border-box;order:1;min-width:0;max-width:100%;display:flex;',
      'flex-wrap:wrap;justify-content:center;align-items:center;gap:12px;row-gap:4px;',
      'color:var(--dsw-alias-label-tertiary);',
      'font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);',
      'line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));',
      'font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}',
      '[data-dsh-sysmon] .dsh-sysmon-pill{box-sizing:border-box;min-width:0;display:inline-flex;',
      'align-items:center;gap:6px;padding:1px 8px;border-radius:999px}',
      '[data-dsh-sysmon] .dsh-sysmon-label{color:inherit}',
      '[data-dsh-sysmon] .dsh-sysmon-value{color:var(--dsw-alias-label-secondary);font-weight:500}',
      // Shared bar metrics. One LENGTH and one THICKNESS for every horizontal
      // bar — the memory and disk meters and every per-core track — so the whole
      // row reads as one family: same length, same 4px thickness. (The two used
      // to differ while the core tracks were hairlines; they no longer do.)
      '[data-dsh-sysmon]{--dsh-sysmon-bar-w:28px;--dsh-sysmon-bar-h:4px}',
      '[data-dsh-sysmon] .dsh-sysmon-meter{position:relative;display:block;flex:none;',
      'width:var(--dsh-sysmon-bar-w);height:var(--dsh-sysmon-bar-h);border-radius:999px;',
      'background:var(--dsw-alias-border-l1);overflow:hidden}',
      // The per-core meter is a GRID, not a wrapped flex column: one ROW per
      // physical core and one COLUMN per hardware thread. On a 2-core/4-thread
      // box that is a 2x2 grid — left column the two primary threads, right
      // column their SMT siblings — which is the shape that makes an overloaded
      // core readable (both of its threads sit on the same row).
      //
      // `grid-auto-flow:column` fills top-to-bottom then left-to-right, and the
      // host emits logical CPUs grouped per core in thread order, so the fill
      // order lands exactly on that layout. The row count is set inline from the
      // resolved topology (`grid-template-rows`), because it is what decides how
      // many rows fit before the flow moves to the next column; without it every
      // track would stack into one tall column. The row height is the shared
      // bar-height variable, so a core track matches the meters.
      '[data-dsh-sysmon] .dsh-sysmon-cores{display:grid;grid-auto-flow:column;flex:none;',
      'grid-auto-columns:var(--dsh-sysmon-bar-w);gap:2px}',
      '[data-dsh-sysmon] .dsh-sysmon-core{position:relative;display:block;',
      'width:var(--dsh-sysmon-bar-w);height:var(--dsh-sysmon-bar-h);',
      'border-radius:999px;background:var(--dsw-alias-border-l1);overflow:hidden}',
      '[data-dsh-sysmon] .dsh-sysmon-fill{position:absolute;top:0;bottom:0;left:0;border-radius:999px;',
      'background:var(--dsw-alias-state-success-primary);transition:width .4s ease}',
      '[data-dsh-sysmon] .dsh-sysmon-fill[data-level=warn]{background:var(--dsw-alias-state-warn-primary)}',
      '[data-dsh-sysmon] .dsh-sysmon-fill[data-level=hot]{background:var(--dsw-alias-state-error-primary)}',
      // The CPU pill is a single 3-column grid row: label | core tracks |
      // (ring + percentage).
      //
      // The ring and the percentage share the THIRD cell, whose content is a
      // flex row with the ring first — that is what puts the ring immediately to
      // the LEFT of the number while adding no grid column, so this pill keeps
      // the width it had before the ring existed. Sharing a flex row also makes
      // the ring and the digits centre on exactly the same line.
      '[data-dsh-sysmon] .dsh-sysmon-cpu{display:inline-grid;',
      'grid-template-columns:auto auto auto;align-items:center;column-gap:6px}',
      '[data-dsh-sysmon] .dsh-sysmon-cpu>.dsh-sysmon-label{grid-column:1}',
      '[data-dsh-sysmon] .dsh-sysmon-cpu>.dsh-sysmon-cores{grid-column:2}',
      '[data-dsh-sysmon] .dsh-sysmon-cpu>.dsh-sysmon-reading{grid-column:3;',
      'display:inline-flex;align-items:center;gap:4px}',
      // The temperature gauge is a RING, not a bar: a small ring is the one
      // shape that fits beside the percentage without widening the pill much,
      // and its arc length carries the reading (see the SVG dash geometry in
      // the component). Colour follows the same temperature bands as before.
      '[data-dsh-sysmon] .dsh-sysmon-temp{position:relative;display:block;flex:none;',
      'width:12px;height:12px;align-self:center;line-height:0}',
      // `display:block` on the SVG is load-bearing, not cosmetic: an inline SVG
      // sits on the text baseline, which pushed the ring 2px below the vertical
      // centre of the label/percentage beside it (the wrapper centred correctly;
      // the SVG inside it did not). Block layout makes the ring fill the 12px
      // box exactly, so its centre matches the row's centre.
      '[data-dsh-sysmon] .dsh-sysmon-temp svg{display:block}',
      '[data-dsh-sysmon] .dsh-sysmon-temp-track{fill:none;',
      'stroke:var(--dsw-alias-border-l1);stroke-width:2px}',
      // The arc is drawn clockwise from 12 o'clock: `stroke-dasharray` holds the
      // filled fraction, `dashoffset` positions its start at the top.
      '[data-dsh-sysmon] .dsh-sysmon-temp-arc{fill:none;stroke-width:2px;',
      'stroke-linecap:round;stroke:var(--dsw-alias-state-success-primary);',
      'transition:stroke-dasharray .4s ease}',
      // Temperature bands: 0–40 °C green, ~40–70 °C orange, above 70 °C red.
      '[data-dsh-sysmon] .dsh-sysmon-temp-arc[data-level=warn]{stroke:var(--dsw-alias-state-warn-primary)}',
      '[data-dsh-sysmon] .dsh-sysmon-temp-arc[data-level=hot]{stroke:var(--dsw-alias-state-error-primary)}',
      '[data-dsh-sysmon][data-state=stale] .dsh-sysmon-value,',
      '[data-dsh-sysmon][data-state=error] .dsh-sysmon-value{opacity:.55}',
      // Narrow viewports only tighten the pills. Bar LENGTH shrinks through the
      // SHARED variable, so the memory meter and every core track shrink by the
      // same amount and stay identical; the thickness is the same 2px on every
      // viewport, and the per-core tracks are never hidden.
      '@media (max-width:480px){',
      '[data-dsh-sysmon]{gap:8px;--dsh-sysmon-bar-w:20px}',
      '[data-dsh-sysmon] .dsh-sysmon-pill{padding:1px 4px}}',
      '@media (prefers-reduced-motion:reduce){[data-dsh-sysmon] .dsh-sysmon-fill{transition:none}}',
    ].join('');

    /** Install the bundle stylesheet once; returns the disposer. */
    function installStyles() {
      if (document.querySelector(`style[data-plugin="${SLOT_ID}"]`) !== null) return () => {};
      const style = document.createElement('style');
      style.dataset.plugin = SLOT_ID;
      style.textContent = CSS;
      document.head.append(style);
      return () => {
        style.remove();
      };
    }

    const GIB = 1024 * 1024 * 1024;

    /** Human byte size; the bar only ever shows GiB-scale memory. */
    function formatBytes(value) {
      if (!Number.isFinite(value) || value <= 0) return '0';
      if (value >= GIB) return `${(value / GIB).toFixed(1)} GiB`;
      return `${Math.round(value / (1024 * 1024))} MiB`;
    }

    /** Percentage with a stable width; `--` while the first sample is pending. */
    function formatPercent(value) {
      return Number.isFinite(value) ? `${Math.round(value)}%` : '--';
    }

    /** Colour band of a meter. */
    function levelOf(value) {
      if (!Number.isFinite(value)) return 'ok';
      if (value >= 85) return 'hot';
      if (value >= 65) return 'warn';
      return 'ok';
    }

    /**
     * Temperature scale of the CPU ring, in °C. The ring spans 0–100 °C so its
     * arc length carries the same meaning as the colour bands: a 40 °C chip
     * draws 40% of the ring and reads green, 70 °C draws 70% and reads red.
     */
    const TEMP_MIN_C = 0;
    const TEMP_MAX_C = 100;
    /** SVG circle circumference for the ring: r=5 in the 12px viewBox. */
    const ARC_RADIUS = 5;
    const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;
    /**
     * Upper bound (exclusive) of the GREEN band. User-specified bands are
     * 0–40 green, 50–70 orange, above 70 red; the gap at 40–50 is attributed to
     * orange, so a chip that is already above idle-but-safe warm reads warm
     * instead of falsely green.
     */
    const TEMP_GREEN_MAX_C = 40;
    /** Upper bound (inclusive) of the ORANGE band; above it the bar is red. */
    const TEMP_ORANGE_MAX_C = 70;

    /** Bar fraction for a Celsius reading, clamped to the scale above. */
    function temperatureFraction(celsius) {
      if (!Number.isFinite(celsius)) return 0;
      const span = TEMP_MAX_C - TEMP_MIN_C;
      const fraction = (celsius - TEMP_MIN_C) / span;
      return Math.min(1, Math.max(0, fraction));
    }

    /**
     * Colour band of a temperature reading: `ok` (green) up to 40 °C, `warn`
     * (orange) through 70 °C, `hot` (red) above it. Expressed as the same
     * `data-level` vocabulary the occupancy meters use, so the existing
     * `.dsh-sysmon-fill[data-level=…]` colour rules apply to the temperature
     * fill unchanged.
     */
    function temperatureLevel(celsius) {
      if (!Number.isFinite(celsius)) return 'ok';
      if (celsius > TEMP_ORANGE_MAX_C) return 'hot';
      if (celsius >= TEMP_GREEN_MAX_C) return 'warn';
      return 'ok';
    }

    /** Compact reading such as `51°`; the unit is in the label and tooltip. */
    function formatCelsius(celsius) {
      return Number.isFinite(celsius) ? `${Math.round(celsius)}°` : '--';
    }

    /** Compact uptime such as `2d 21h` or `4h 12m`. */
    function formatUptime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return '';
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h`;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

    /** One pill: label, slim meter, value. */
    function Pill(props) {
      const percent = Number.isFinite(props.percent) ? props.percent : 0;
      return h(
        'span',
        { className: 'dsh-sysmon-pill' },
        h('span', { className: 'dsh-sysmon-label' }, props.label),
        h(
          'span',
          { className: 'dsh-sysmon-meter', 'aria-hidden': 'true' },
          h('span', {
            className: 'dsh-sysmon-fill',
            'data-level': levelOf(props.percent),
            style: { width: `${Math.max(0, Math.min(100, percent))}%` },
          }),
        ),
        h('span', { className: 'dsh-sysmon-value' }, props.value),
      );
    }

    /**
     * One CPU pill whose meter is a grid of HORIZONTAL tracks: one ROW per
     * physical core, one COLUMN per hardware thread. On a 2-core/4-thread box
     * that draws 2x2 — left column the two primary threads, right column their
     * SMT siblings — so both threads of an overloaded core share a row.
     *
     * `props.topology` is the host's resolved layout; when it is absent (a
     * platform without sysfs topology) every logical CPU becomes its own row in
     * a single column, which is the old behaviour and still correct, just
     * without the core/thread grouping.
     *
     * The tracks are always visible, at every width: they are the reason this
     * pill exists, and hiding them on a phone (as an earlier revision did) left
     * the CPU pill with no meter at all next to a memory pill that had one.
     */
    function CpuCoresPill(props) {
      const cores = props.cores;
      const topology = Array.isArray(props.topology) ? props.topology : undefined;

      // Rows = PHYSICAL CORES, columns = hardware threads. That is the whole
      // point of the grid: a 2-core/4-thread box draws 2 rows x 2 columns, so
      // both threads of one core share a row and an overloaded core is obvious.
      // (Getting this backwards gives one row per THREAD — on a 2-core/2-thread
      // box that collapses to a single row of two columns, which reads as "the
      // physical cores are side by side".)
      //
      // Without topology every logical CPU is its own row in a single column,
      // which is the honest fallback: nothing claims to know the SMT pairing.
      const rowCount = topology === undefined
        ? Math.max(1, cores.length)
        : Math.max(1, topology.reduce((max, entry) => Math.max(max, entry.core + 1), 0));
      // `grid-template-rows` has to name every row explicitly: with
      // `grid-auto-flow:column` an unnamed implicit row would be appended to the
      // single column instead of starting a new one. The row height is the shared
      // TRACK-height variable (not a literal), so every core track stays exactly
      // as thick as its neighbours.
      const rows = `repeat(${rowCount}, var(--dsh-sysmon-bar-h))`;

      return h(
        'span',
        { className: 'dsh-sysmon-pill dsh-sysmon-cpu' },
        h('span', { className: 'dsh-sysmon-label' }, props.label),
        h(
          'span',
          {
            className: 'dsh-sysmon-cores',
            'aria-hidden': 'true',
            style: { gridTemplateRows: rows },
          },
          cores.map((percent, index) => {
            const slot = topology === undefined ? undefined : topology[index];
            const title = slot === undefined
              ? `${props.coreLabel} ${index + 1}: ${formatPercent(percent)}`
              : `${props.coreLabel} ${slot.core + 1}·${slot.thread + 1}: ${formatPercent(percent)}`;
            return h(
              'span',
              {
                key: index,
                className: 'dsh-sysmon-core',
                title,
              },
              h('span', {
                className: 'dsh-sysmon-fill',
                'data-level': levelOf(percent),
                style: {
                  width: `${Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))}%`,
                },
              }),
            );
          }),
        ),
        // The ring and the percentage share one cell: the ring comes first, so
        // it renders immediately to the LEFT of the number. Sharing the cell adds
        // no grid column (the pill keeps its previous width) and lets one flex
        // row centre the ring and the digits on the same line.
        h(
          'span',
          { className: 'dsh-sysmon-reading' },
          Number.isFinite(props.temperature)
            ? h(
                'span',
                {
                  className: 'dsh-sysmon-temp',
                  title: `${props.tempLabel}: ${formatCelsius(props.temperature)}`,
                },
                // 12px box with a 2px stroke, so the arc's centre radius is 5px.
                h(
                  'svg',
                  { viewBox: '0 0 12 12', width: 12, height: 12, 'aria-hidden': 'true' },
                  h('circle', { className: 'dsh-sysmon-temp-track', cx: 6, cy: 6, r: 5 }),
                  h('circle', {
                    className: 'dsh-sysmon-temp-arc',
                    'data-level': temperatureLevel(props.temperature),
                    cx: 6,
                    cy: 6,
                    r: 5,
                    // Clockwise from 12 o'clock: `stroke-dasharray` is
                    // [filled, rest] in path units, and rotate(-90) moves the
                    // start of the dash to the top of the ring.
                    strokeDasharray: `${(temperatureFraction(props.temperature) * ARC_CIRCUMFERENCE).toFixed(2)} ${ARC_CIRCUMFERENCE.toFixed(2)}`,
                    transform: 'rotate(-90 6 6)',
                  }),
                ),
              )
            : null,
          h('span', { className: 'dsh-sysmon-value' }, props.value),
        ),
      );
    }

    /**
     * The dock pills. They poll the package's own host route; the payload is
     * read-only machine telemetry, so a failed request keeps the last numbers
     * on screen (dimmed) instead of blanking the row.
     */
    function SysmonPills(props) {
      const t = props.t;
      const [snapshot, setSnapshot] = React.useState({ phase: 'loading' });
      const rootRef = React.useRef(null);

      // Turn on wrapping for the ROW, not just for this element. The row is
      // shipped UI, so it is found by walking up from here until an ancestor
      // actually computes to a flex container: the slot outlet wrappers are
      // `display:contents`, so they are skipped by the computed style rather
      // than by guessing a fixed depth. The attribute is removed on unmount, so
      // the row returns to its shipped behaviour when this plugin unloads.
      React.useEffect(() => {
        const node = rootRef.current;
        if (node === null || node === undefined) return () => {};
        const read = (element) => {
          if (typeof getComputedStyle !== 'function') return '';
          try {
            return getComputedStyle(element).display;
          } catch {
            return '';
          }
        };
        let row = node.parentElement;
        for (let depth = 0; row !== null && row !== undefined && depth < 8; depth += 1) {
          const display = read(row);
          if (display === 'flex' || display === 'inline-flex') {
            row.setAttribute(ROW_ATTR, '');
            const marked = row;
            return () => marked.removeAttribute(ROW_ATTR);
          }
          row = row.parentElement;
        }
        return () => {};
      }, []);

      React.useEffect(() => {
        let disposed = false;
        let timer;
        let controller;
        // Monotonic token so a superseded poll cannot publish its result or
        // clear the controller of the poll that replaced it.
        let generation = 0;

        const clear = () => {
          if (timer === undefined) return;
          clearTimeout(timer);
          timer = undefined;
        };
        const schedule = () => {
          clear();
          if (disposed) return;
          timer = setTimeout(() => {
            void run();
          }, POLL_MS);
        };
        const run = async () => {
          timer = undefined;
          if (disposed) return;
          if (document.visibilityState === 'hidden') {
            schedule();
            return;
          }
          const mine = ++generation;
          // A visibility change can race an in-flight poll; drop the old one.
          try {
            controller?.abort();
          } catch {
            /* already settled */
          }
          const local = new AbortController();
          controller = local;
          const abortTimer = setTimeout(() => {
            try {
              local.abort();
            } catch {
              /* already settled */
            }
          }, REQUEST_TIMEOUT_MS);
          try {
            const response = await fetch('/dsh-sysmon/api', {
              method: 'GET',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { accept: 'application/json' },
              signal: local.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (disposed || mine !== generation) return;
            if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
              throw new Error('unexpected payload');
            }
            setSnapshot({ phase: 'ok', data: payload });
          } catch {
            if (disposed || mine !== generation) return;
            setSnapshot((previous) =>
              previous.data === undefined
                ? { phase: 'error' }
                : { phase: 'stale', data: previous.data },
            );
          } finally {
            clearTimeout(abortTimer);
            if (mine === generation) {
              controller = undefined;
              schedule();
            }
          }
        };
        const onVisibility = () => {
          if (document.visibilityState !== 'visible') return;
          clear();
          void run();
        };

        document.addEventListener('visibilitychange', onVisibility);
        void run();
        return () => {
          disposed = true;
          clear();
          document.removeEventListener('visibilitychange', onVisibility);
          try {
            controller?.abort();
          } catch {
            /* already settled */
          }
        };
      }, []);

      const data = snapshot.data;
      const cpuPercent = Number.isFinite(data?.cpuPercent) ? data.cpuPercent : undefined;
      const cpuCores = Array.isArray(data?.cpuCores) ? data.cpuCores : undefined;
      const cpuTopology = Array.isArray(data?.cpuTopology) ? data.cpuTopology : undefined;
      const memoryPercent = Number.isFinite(data?.memory?.percent) ? data.memory.percent : undefined;
      const diskPercent = Number.isFinite(data?.disk?.percent) ? data.disk.percent : undefined;
      const temperature = Number.isFinite(data?.temperature?.celsius)
        ? data.temperature.celsius
        : undefined;
      const temperatureSensor = typeof data?.temperature?.label === 'string'
        ? data.temperature.label
        : undefined;
      const load = Array.isArray(data?.loadAverage) ? data.loadAverage : undefined;

      // One bar per logical core. A payload from an older host half carries no
      // per-core array: then no bars are drawn at all rather than N empty ones
      // that would read as "every core idle". A core without a usable delta
      // still keeps its slot so its neighbours never shift.
      const corePercents = (cpuCores ?? []).map((value) =>
        Number.isFinite(value) ? value : undefined,
      );

      const tooltip = data === undefined
        ? t('label.unavailable')
        : [
            `${t('label.cpu')} ${formatPercent(cpuPercent)} (${data.cpuCount ?? '?'} ${t('tooltip.cores')})`,
            corePercents.length === 0
              ? null
              : `${t('label.cores')} ${corePercents.map((value) => formatPercent(value)).join(' ')}`,
            `${t('label.load')} ${(load ?? []).map((value) => Number(value).toFixed(2)).join(' ')}`,
            Number.isFinite(temperature)
              ? `${t('label.temperature')} ${formatCelsius(temperature)}${temperatureSensor === undefined ? '' : ` (${temperatureSensor})`}`
              : null,
            `${t('label.memory')} ${formatBytes(data.memory?.used)} / ${formatBytes(data.memory?.total)} (${formatPercent(memoryPercent)})`,
            data.disk === null || data.disk === undefined
              ? null
              : `${t('tooltip.disk')} ${formatBytes(data.disk.used)} / ${formatBytes(data.disk.total)} (${formatPercent(diskPercent)})`,
            `${t('tooltip.swap')} ${formatBytes(data.swap?.used)} / ${formatBytes(data.swap?.total)}`,
            `${t('tooltip.uptime')} ${formatUptime(data.uptime)}`,
          ]
            .filter((line) => line !== null)
            .join(' · ');

      return h(
        'div',
        {
          ref: rootRef,
          'data-dsh-sysmon': '',
          'data-state': snapshot.phase,
          title: tooltip,
          role: 'group',
          'aria-label': t('label.bar'),
        },
        h(CpuCoresPill, {
          label: t('label.cpu'),
          cores: corePercents,
          topology: cpuTopology,
          value: formatPercent(cpuPercent),
          coreLabel: t('label.core'),
          temperature,
          tempLabel: temperatureSensor === undefined
            ? t('label.temperature')
            : `${t('label.temperature')} · ${temperatureSensor}`,
        }),
        h(Pill, {
          label: t('label.memory'),
          percent: memoryPercent,
          value: formatPercent(memoryPercent),
        }),
        // Disk renders only when the host could measure it, so a platform
        // without `statfs` shows two pills instead of a permanent `硬盘 --`.
        data === undefined || data.disk === null || data.disk === undefined
          ? null
          : h(Pill, {
              label: t('label.disk'),
              percent: diskPercent,
              value: formatPercent(diskPercent),
            }),
      );
    }

    const inject = ['slots', 'locale'];

    function apply(ctx) {
      ctx.effect(() => installStyles(), 'dsh-sysmon: styles');
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-sysmon: locale');

      // `locale: NS` makes the framework hand the component its `t` seat and
      // re-render the entry whenever the active locale changes. `order` puts
      // these pills after the shipped stats pills (id `stats`, order 0).
      ctx.slots.inject(SLOT_NAME, () =>
        ctx.slots.register(
          {
            name: SLOT_NAME,
            id: SLOT_ID,
            order: 10,
            locale: NS,
            label: () => ctx.locale.bind(NS)('label.bar'),
          },
          SysmonPills,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
