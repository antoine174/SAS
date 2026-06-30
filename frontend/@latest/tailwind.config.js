/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'sans-serif'],
      },
      keyframes: {
        // Used by ProgressBar during merge
        progress: {
          '0%':   { width: '0%',   marginLeft: '0%'   },
          '50%':  { width: '60%',  marginLeft: '20%'  },
          '100%': { width: '0%',   marginLeft: '100%' },
        },
      },
      animation: {
        progress: 'progress 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
