import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const headers = { 'Cache-Control': 'no-store' };
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, headers },
  preview: { port: 5174, strictPort: true, headers },
});
