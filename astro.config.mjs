// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: process.env.PAGES_SITE || undefined,
  base: process.env.PAGES_BASE || '/',
  vite: {
    plugins: [tailwindcss()]
  }
});
