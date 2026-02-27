/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        gray: {
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
        },
        blue: {
          600: '#2563eb',
          700: '#1d4ed8',
        },
        green: {
          600: '#16a34a',
          700: '#15803d',
        },
        red: {
          600: '#dc2626',
        },
      },
    },
  },
  plugins: [],
}
