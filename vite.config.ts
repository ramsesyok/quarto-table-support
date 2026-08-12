import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis'
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/webview/main.tsx'),
      formats: ['iife'],
      name: 'QuartoTableWebview',
      fileName: () => 'assets/main.js'
    },
    outDir: path.resolve(__dirname, 'out/webview'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // extension.ts が assets/main.css を参照するので名前を固定する
        assetFileNames: 'assets/main.[ext]'
      }
    },
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    sourcemap: process.env.NODE_ENV !== 'production'
  },
  resolve: {
    alias: {
      '@model': path.resolve(__dirname, 'src/model'),
      '@formats': path.resolve(__dirname, 'src/formats')
    }
  }
})
