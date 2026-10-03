/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm, archival palette — library / living room / family album.
        cream: '#f6ecd9',
        parchment: '#efe3cb',
        linen: '#faf5ea',
        ink: '#2c2016',
        cocoa: '#4a3620',
        umber: '#6b4f2d',
        gold: '#c9a35e',
        sage: '#7d8a6a',
        plum: '#6b4a63',
        ember: '#b8603a',
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        warm: '0 10px 40px -12px rgba(74, 54, 32, 0.35)',
        lamp: '0 0 80px -10px rgba(201, 163, 94, 0.5)',
      },
    },
  },
  plugins: [],
};
