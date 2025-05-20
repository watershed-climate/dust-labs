/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    {
      pattern: /bg-(red|green|blue|yellow|gray)-(100|200|300|400|500)/,
    },
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      typography: {
        DEFAULT: {
          css: {
            table: {
              overflow: 'hidden',
              borderCollapse: 'collapse',
              width: '100%',
              marginTop: '1rem',
              marginBottom: '1rem',
            },
            'thead, tbody': {
              borderWidth: '1px',
              borderColor: 'rgb(229, 231, 235)',
            },
            'th, td': {
              borderWidth: '1px',
              borderColor: 'rgb(229, 231, 235)',
              padding: '0.5rem 0.75rem',
              textAlign: 'left',
            },
            th: {
              backgroundColor: 'rgb(249, 250, 251)',
              fontWeight: '600',
            },
            'tr:nth-child(even)': {
              backgroundColor: 'rgb(249, 250, 251)',
            },
          },
        },
      },
    },
  },
  plugins: [],
};
