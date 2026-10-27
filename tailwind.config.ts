import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#282a75', 900: '#1b1d55', 700: '#3a3d94', 100: '#e6e7f4' },
        orange: { DEFAULT: '#ee8a33', 700: '#c96d1b', 100: '#fdeadb' },
        cream: { DEFAULT: '#fff8f3', 200: '#f7ece3' },
        ink: '#1c1d45',
        line: '#e6dfd7',
        ok: '#2f7d52',
        late: '#b3261e',
      },
      fontFamily: {
        display: ['Oswald', 'Arial Narrow', 'Arial', 'sans-serif'],
        sans: ['"Fira Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '2px', sm: '2px', md: '3px', lg: '4px' },
    },
  },
  plugins: [],
};
export default config;
