// PostCSS config for Tailwind CSS v4.
// @tailwindcss/postcss processes the `@import "tailwindcss"` directive in globals.css
// and emits all utility classes used in the project.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
