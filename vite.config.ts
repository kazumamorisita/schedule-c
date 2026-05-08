import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // もしくは使用中のフレームワーク

export default defineConfig({
  plugins: [react()],
  base: '/schedule-c/', // リポジトリ名を指定
})
