/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:  '#F7F6F2',
        surface: '#FFFFFF',
        ink:     { DEFAULT: '#1C252C', muted: '#64707A', subtle: '#94A0A8' },
        line:    '#E7E5DF',
        brand:   { DEFAULT: '#0F4C5C', hover: '#0B3A47', light: '#E6F2F4', mid: '#B9DDE3' },
        accent:  { DEFAULT: '#D97706', light: '#FEF3C7', soft: '#FFFBEB' },
        prod:    { light: '#EBF3FB', mid: '#C6DFEF', dark: '#2E75B6' },
        lecture: { light: '#EBF5EB', mid: '#C6EFCE', dark: '#375623' },
        com:     { light: '#FEF0E7', mid: '#FCE4D6', dark: '#843C00' },
        finale:  { light: '#FFF7E0', mid: '#FDE68A', dark: '#92400E' },
      },
      boxShadow: {
        card:  '0 1px 2px rgba(28, 37, 44, 0.04), 0 4px 12px rgba(28, 37, 44, 0.03)',
        float: '0 8px 24px rgba(15, 76, 92, 0.08), 0 2px 6px rgba(28, 37, 44, 0.04)',
      },
    },
  },
  plugins: [],
}
