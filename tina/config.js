import { defineConfig } from 'tinacms'
import { collections } from './collections.mjs'

// Content is built from Git. Visitors never need a Tina account or API request.
export default defineConfig({
  branch: process.env.NEXT_PUBLIC_TINA_BRANCH || 'main',
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID,
  token: process.env.TINA_TOKEN,
  build: { publicFolder: 'public', outputFolder: 'admin' },
  telemetry: 'disabled',
  media: {
    accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
    tina: { publicFolder: 'public', mediaRoot: 'uploads', static: false },
  },
  schema: { collections },
})
