import { defineConfig } from 'vite';

// Repo lives at github.com/JWNelly/Recipe-App, so GitHub Pages serves it at /Recipe-App/.
// Locally Vite serves at /, so we only set the base for production builds.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Recipe-App/' : '/',
}));
