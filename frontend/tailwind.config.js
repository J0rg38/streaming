/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta oscura estilo streaming
        brand: '#e50914',      // rojo acento
        surface: '#141414',    // fondo principal
        card: '#1f1f1f',       // tarjetas
      },
    },
  },
  plugins: [],
};
