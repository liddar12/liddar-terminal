/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        term: {
          bg: '#0b0e14',
          panel: '#0f131c',
          fg: '#d8dee9',
          muted: '#6b7280',
          accent: '#e8b64c',
          up: '#4cc38a',
          down: '#e5534b',
          grid: '#1f2430',
          dma50: '#5e9bd6',
          dma200: '#b07cd6',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
