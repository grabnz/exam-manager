/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        prod:    { light: '#EBF3FB', mid: '#C6DFEF', dark: '#2E75B6' },
        lecture: { light: '#EBF5EB', mid: '#C6EFCE', dark: '#375623' },
        com:     { light: '#FEF0E7', mid: '#FCE4D6', dark: '#843C00' },
        finale:  { light: '#FFF2CC', mid: '#FFE699', dark: '#7F6000' },
      },
    },
  },
  plugins: [],
}
