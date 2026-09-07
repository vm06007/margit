import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Serves ported static pages at fixed paths — every other path still boots the React app. */
function landingHomepage(): Plugin {
  const routes: Record<string, string> = {
    '/': fileURLToPath(new URL('./public/landing/index.html', import.meta.url)),
    '/catalog2': fileURLToPath(new URL('./public/landing/catalog2.html', import.meta.url)),
    '/myrepos2': fileURLToPath(new URL('./public/landing/myrepos2.html', import.meta.url)),
    '/services2': fileURLToPath(new URL('./public/landing/services2.html', import.meta.url)),
    '/works2': fileURLToPath(new URL('./public/landing/works2.html', import.meta.url)),
  }
  // /repo2/:owner/:name — same static file regardless of which repo; the page's own
  // client-side JS reads the URL to know which one to fetch, same idea as an SPA route.
  const prefixRoutes: Array<[string, string]> = [
    ['/repo2/', fileURLToPath(new URL('./public/landing/repo2.html', import.meta.url))],
  ]
  return {
    name: 'landing-homepage',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        const exact = routes[url]
        const prefixMatch = prefixRoutes.find(([prefix]) => url.startsWith(prefix))
        const filePath = exact ?? prefixMatch?.[1]
        if (filePath) {
          res.setHeader('Content-Type', 'text/html')
          res.end(readFileSync(filePath))
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), landingHomepage()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
    watch: {
      // Not wired into the app yet — a big reference template sitting in the
      // repo root, kept around to build the homepage from later.
      ignored: ['**/portfolio-html-template/**'],
    },
  },
})
