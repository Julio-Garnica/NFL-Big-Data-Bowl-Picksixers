/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), soft: v('soft'), line: v('line'), fg: v('fg'), muted: v('muted'),
        accent: v('accent'), onaccent: v('onaccent'), accent2: v('accent2'), good: v('good'), bad: v('bad'), warn: v('warn'),
      },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px -12px rgb(0 0 0 / 0.25)' },
    },
  },
  plugins: [],
}
