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
      'label.load': '负载',
      'label.unavailable': '不可用',
      'tooltip.cores': '核心',
      'tooltip.swap': '交换分区',
      'tooltip.uptime': '运行时长',
    };

    const en = {
      'label.bar': 'System status',
      'label.cpu': 'CPU',
      'label.core': 'Core',
      'label.cores': 'Cores',
      'label.memory': 'MEM',
      'label.load': 'LOAD',
      'label.unavailable': 'unavailable',
      'tooltip.cores': 'cores',
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
      '[data-dsh-sysmon] .dsh-sysmon-detail{color:var(--dsw-alias-label-tertiary);opacity:.85}',
      '[data-dsh-sysmon] .dsh-sysmon-meter{position:relative;display:block;flex:none;',
      'width:28px;height:4px;border-radius:999px;background:var(--dsw-alias-border-l1);overflow:hidden}',
      '[data-dsh-sysmon] .dsh-sysmon-cores{display:flex;flex:none;align-items:flex-end;gap:2px;height:10px}',
      // The CPU pill carries BOTH meters: the per-core histogram when there is
      // room, and a single aggregate bar that takes over when the histogram is
      // dropped on narrow viewports. Without it the CPU pill would be the only
      // one with no meter at all below 720px — memory keeps its own
      // `.dsh-sysmon-meter` — which reads as "the CPU pill is broken" instead of
      // "the per-core detail is hidden".
      '[data-dsh-sysmon] .dsh-sysmon-aggregate{display:none}',
      '[data-dsh-sysmon] .dsh-sysmon-core{position:relative;display:block;flex:none;width:4px;height:100%;',
      'border-radius:1px;background:var(--dsw-alias-border-l1);overflow:hidden}',
      // Per-core bars grow upward from the baseline. `top:auto` is load-bearing,
      // not cosmetic: the shared `.dsh-sysmon-fill` rule below pins `top:0`, and
      // an absolutely positioned box that specifies `top`, `bottom` AND `height`
      // resolves against `top` — which made every bar fill top-down (inverted).
      '[data-dsh-sysmon] .dsh-sysmon-core .dsh-sysmon-fill{position:absolute;top:auto;bottom:0;',
      'left:0;right:0;border-radius:0;',
      'background:var(--dsw-alias-state-success-primary);transition:height .4s ease}',
      '[data-dsh-sysmon] .dsh-sysmon-fill{position:absolute;top:0;bottom:0;left:0;border-radius:999px;',
      'background:var(--dsw-alias-state-success-primary);transition:width .4s ease}',
      '[data-dsh-sysmon] .dsh-sysmon-fill[data-level=warn]{background:var(--dsw-alias-state-warn-primary)}',
      '[data-dsh-sysmon] .dsh-sysmon-fill[data-level=hot]{background:var(--dsw-alias-state-error-primary)}',
      '[data-dsh-sysmon][data-state=stale] .dsh-sysmon-value,',
      '[data-dsh-sysmon][data-state=error] .dsh-sysmon-value{opacity:.55}',
      // Narrow viewports: swap the per-core histogram for the aggregate bar (it
      // is the widest decoration and the aggregate % still carries the meaning),
      // then tighten the pills so both metrics keep their own line if they must.
      '@media (max-width:720px){[data-dsh-sysmon] .dsh-sysmon-cores{display:none}',
      '[data-dsh-sysmon] .dsh-sysmon-aggregate{display:block}}',
      '@media (max-width:480px){',
      '[data-dsh-sysmon]{gap:8px}',
      '[data-dsh-sysmon] .dsh-sysmon-pill{padding:1px 4px}',
      '[data-dsh-sysmon] .dsh-sysmon-meter{width:20px}',
      '[data-dsh-sysmon] .dsh-sysmon-detail{display:none}}',
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

    /** Compact `2.7/3.7 GiB` pair, so the pill stays narrow next to the stats pills. */
    function formatPair(used, total) {
      if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return undefined;
      if (total >= GIB) return `${(used / GIB).toFixed(1)}/${(total / GIB).toFixed(1)} GiB`;
      return `${Math.round(used / (1024 * 1024))}/${Math.round(total / (1024 * 1024))} MiB`;
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
        props.detail === undefined ? null : h('span', { className: 'dsh-sysmon-detail' }, props.detail),
      );
    }

    /**
     * One CPU pill whose meter is split into one bar per logical core, so a busy
     * core is visible even when the aggregate average looks calm. Cores are
     * rendered in `os.cpus()` order, left to right, and a core without a usable
     * sample keeps its slot (dimmed, `--`) instead of shifting its neighbours.
     *
     * A second, aggregate meter rides along hidden; the narrow-viewport media
     * query shows it and hides the histogram, so the pill always has a meter
     * whichever layout is active.
     */
    function CpuCoresPill(props) {
      const cores = props.cores;
      const percent = Number.isFinite(props.percent) ? props.percent : 0;
      return h(
        'span',
        { className: 'dsh-sysmon-pill' },
        h('span', { className: 'dsh-sysmon-label' }, props.label),
        h(
          'span',
          { className: 'dsh-sysmon-cores', 'aria-hidden': 'true' },
          cores.map((percent, index) =>
            h(
              'span',
              {
                key: index,
                className: 'dsh-sysmon-core',
                title: `${props.coreLabel} ${index + 1}: ${formatPercent(percent)}`,
              },
              h('span', {
                className: 'dsh-sysmon-fill',
                'data-level': levelOf(percent),
                style: {
                  height: `${Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))}%`,
                },
              }),
            ),
          ),
        ),
        h(
          'span',
          { className: 'dsh-sysmon-meter dsh-sysmon-aggregate', 'aria-hidden': 'true' },
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
      const memoryPercent = Number.isFinite(data?.memory?.percent) ? data.memory.percent : undefined;
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
            `${t('label.memory')} ${formatBytes(data.memory?.used)} / ${formatBytes(data.memory?.total)} (${formatPercent(memoryPercent)})`,
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
          percent: cpuPercent,
          value: formatPercent(cpuPercent),
          coreLabel: t('label.core'),
        }),
        h(Pill, {
          label: t('label.memory'),
          percent: memoryPercent,
          value: formatPercent(memoryPercent),
          detail: data === undefined ? undefined : formatPair(data.memory?.used, data.memory?.total),
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
