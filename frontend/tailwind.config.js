/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta oscura estilo streaming — acento terracota
        brand: '#E35336',      // naranja terracota (acento principal)
        'brand-dark': '#C13D24', // terracota oscuro (hover)
        surface: '#141414',    // fondo principal
        card: '#1f1f1f',       // tarjetas
      },
    },
  },
  plugins: [],
};
