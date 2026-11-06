/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        kitchen: {
          50: "#f5f8f2",
          600: "#31835d",
          700: "#226b4a"
        }
      }
    }
  },
  plugins: []
};
