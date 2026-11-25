/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        pop: {
          bg: '#F7F8FA',
          surface: '#FFFFFF',
          text: '#18181B',
          muted: '#71717A',
          yellow: '#F6C344',
          yellowDark: '#A16207',
          green: '#16A34A',
          red: '#DC2626',
          border: '#E4E4E7',
        }
      }
    },
  },
  plugins: [],
}
