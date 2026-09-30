// Theme from the organiser's mood board: deep forest teal, brown leather, sage, sand/peach.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Nunito', 'ui-rounded', 'system-ui', 'sans-serif'] },
      colors: {
        bg: '#0e3a30', card: '#1d5a49', line: '#2f6f5b', sand: '#efcfa5', ink: '#3a2216',
        leaf: '#8fbf7a', bark: '#6b3f2c', sage: '#7fae6f', cream: '#f6e6cc',
        zinc: { 300: '#d3e3d6', 400: '#a9c4b3', 500: '#86a794', 600: '#5f8a76', 700: '#2f6f5b' },
      },
      boxShadow: { lift: '0 10px 24px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.08)', glow: '0 8px 18px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.12) inset' },
    },
  },
  plugins: [],
};
