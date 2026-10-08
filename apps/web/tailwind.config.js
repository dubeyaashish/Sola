/** Sola UI tokens. Spec's "brand blue" role is played by Sola red; gold is the secondary accent (gold price, logo, gold-related pills). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#fdf3f4', 100: '#fbe1e4', 200: '#f5c2c8', 500: '#c8283a', 600: '#b3202f', 700: '#9b1b30', 900: '#5a0c17' },
        gold: { 50: '#fcf8e9', 100: '#f7edc9', 200: '#efdc9c', 400: '#dcbc52', 500: '#c9a227', 600: '#a98418', 700: '#85650f' },
        ink: { 50: '#f6f7f9', 100: '#eceef2', 200: '#d9dde4', 300: '#b8bfcc', 400: '#8a93a6', 500: '#636d82', 700: '#384154', 900: '#161b26' },
      },
      fontFamily: { sans: ['"IBM Plex Sans Thai"', '"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 2px rgba(22,27,38,.06), 0 1px 3px rgba(22,27,38,.08)',
        page: '0 2px 12px rgba(22,27,38,.12)',
      },
    },
  },
  plugins: [],
};
