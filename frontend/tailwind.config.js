/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        aero: {
          bg:       'var(--bg)',
          bg2:      'var(--bg2)',
          bg3:      'var(--bg3)',
          surface:  'var(--surface)',
          surface2: 'var(--surface2)',
          surface3: 'var(--surface3)',
          accent:   'var(--accent)',
          accent2:  'var(--accent2)',
          green:    'var(--green)',
          amber:    'var(--amber)',
          red:      'var(--red)',
          purple:   'var(--purple)',
          text:     'var(--text)',
          text2:    'var(--text2)',
          text3:    'var(--text3)',
          text4:    'var(--text4)',
          text5:    'var(--text5)',
          border:   'var(--border)',
          border2:  'var(--border2)',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        mono:    ['DM Mono', 'monospace'],
        sans:    ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
