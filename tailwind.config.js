/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#061316',
        accent: { DEFAULT: '#14B8A6', soft: '#5EEAD4', deep: '#0F766E' },
        amber: { DEFAULT: '#F59E0B' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      borderRadius: { glass: '18px' },
      boxShadow: { glass: '0 10px 40px -10px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.25)' },
    },
  },
  plugins: [],
};
