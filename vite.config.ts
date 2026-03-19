import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { backendVaultPlugin } from './plugins/vite-vault-plugin';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './',
      server: {
        port: 5173,
        host: '0.0.0.0',
        proxy: {
          '/nvidia-api': {
            target: 'https://integrate.api.nvidia.com/v1',
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/nvidia-api/, ''),
            secure: true,
          },
        },
      },
      plugins: [react(), backendVaultPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
