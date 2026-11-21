import { existsSync } from 'node:fs'

if (!existsSync('node_modules/@tinacms/cli/package.json') || !existsSync('node_modules/tinacms/package.json')) {
  console.error('CMS tools are not installed. Run npm run setup:cms, then npm run dev:cms once. Commit the updated package files and tina/tina-lock.json before deploying. See docs/SEO-AND-HOSTING.md.')
  process.exit(1)
}
