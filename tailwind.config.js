/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './lib/**/*.js'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', sunk: 'var(--sunk)', ink: 'var(--ink)', muted: 'var(--muted)', line: 'var(--line)',
        accent: 'var(--accent)', 'accent-soft': 'var(--accent-soft)', 'on-accent': 'var(--on-accent)',
        up: 'var(--up)', 'up-soft': 'var(--up-soft)', down: 'var(--down)', 'down-soft': 'var(--down-soft)',
        flat: 'var(--flat)', 'flat-soft': 'var(--flat-soft)', warn: 'var(--warn)', 'warn-soft': 'var(--warn-soft)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
