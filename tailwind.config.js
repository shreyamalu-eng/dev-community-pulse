/** @type {import('tailwindcss').Config} */
const v = (n) => `var(--${n})`;
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
      },
      fontFamily: {
        display: ['var(--font-display)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '20px', ctl: '12px' },
    },
  },
  plugins: [],
};
