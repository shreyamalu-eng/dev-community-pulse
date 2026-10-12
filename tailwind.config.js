/** @type {import('tailwindcss').Config} */
// colours are CSS variables; opacity modifiers (border-alert/50) resolve through color-mix
const v = (n) => ({ opacityValue }) => (opacityValue === undefined || opacityValue === '1' ? `var(--${n})` : `color-mix(in srgb, var(--${n}) calc(${opacityValue} * 100%), transparent)`);
module.exports = {
  content: ['./app/**/*.{js,jsx}', './lib/**/*.js'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), 'surface-2': v('surface-2'), sunk: v('sunk'), line: v('line'), 'line-strong': v('line-strong'),
        ink: v('ink'), muted: v('muted'), faint: v('faint'),
        red: v('red'), 'red-ink': v('red-ink'), 'red-soft': v('red-soft'), 'on-red': v('on-red'),
        orange: v('orange'), 'orange-ink': v('orange-ink'), 'orange-soft': v('orange-soft'),
        blue: v('blue'), 'blue-ink': v('blue-ink'), 'blue-soft': v('blue-soft'),
        steady: v('steady'), 'steady-soft': v('steady-soft'), cool: v('cool'), 'cool-soft': v('cool-soft'),
        warn: v('warn'), 'warn-soft': v('warn-soft'), ok: v('ok'), 'ok-soft': v('ok-soft'),
        alert: v('alert'), 'alert-ink': v('alert-ink'), 'alert-soft': v('alert-soft'), track: v('track'), link: v('link'),
      },
      fontFamily: {
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '16px', ctl: '12px' },
    },
  },
  plugins: [],
};
