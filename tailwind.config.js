/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"'
        ],
        mono: [
          '"SF Mono"',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace'
        ]
      },
      colors: {
        mac: {
          bg: '#f5f5f7',
          card: '#ffffff',
          darkBg: '#1e1e1e',
          darkCard: '#252526',
          border: 'rgba(0, 0, 0, 0.08)',
          darkBorder: 'rgba(255, 255, 255, 0.1)',
          accent: '#0071e3',
          accentDark: '#0a84ff',
          trafficRed: '#ff5f56',
          trafficYellow: '#ffbd2e',
          trafficGreen: '#27c93f'
        }
      },
      boxShadow: {
        'mac-window': '0 20px 70px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.08)',
        'mac-dark-window': '0 20px 70px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.12)'
      }
    },
  },
  plugins: [],
}
