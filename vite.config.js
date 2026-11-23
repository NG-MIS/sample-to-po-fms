import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Port 3000 matches the address Supabase sends people back to after they
  // open a confirmation or password reset link from their email.
  server: { port: 3000, strictPort: true },
})
