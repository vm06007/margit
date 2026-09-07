import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Pages that share the header/hamburger-menu/agent-sidebar chrome (see
// public/landing/works2.html vs catalog2.html — they were hand-duplicated and drifted)
// mark the three injection points with these HTML comments instead of inlining the
// markup themselves. The single source of truth lives in
// public/landing/partials/header-and-sidebar.html, split into named sections since the
// three elements land in different places in the surrounding page (.mxd-nav__wrap
// before #app-row opens, <header> just inside #mxd-page-wrap, #agent-sidebar after
// #mxd-page-wrap closes but still inside #app-row).
const SHARED_CHROME_PARTIAL = fileURLToPath(new URL('./public/landing/partials/header-and-sidebar.html', import.meta.url))
const SHARED_CHROME_MARKERS: Record<string, string> = {
  '<!-- SHARED:nav -->': 'nav',
  '<!-- SHARED:header -->': 'header',
  '<!-- SHARED:agent-sidebar -->': 'agent-sidebar',
}

function injectSharedChrome(html: string): string {
  if (!Object.keys(SHARED_CHROME_MARKERS).some((marker) => html.includes(marker))) return html
  // Re-read on every request (dev-only, cheap) so editing the partial and refreshing
  // the browser picks up changes immediately, same as editing the page files directly.
  const partial = readFileSync(SHARED_CHROME_PARTIAL, 'utf-8')
  let out = html
  for (const [marker, section] of Object.entries(SHARED_CHROME_MARKERS)) {
    const beginTag = `<!-- BEGIN:${section} -->`
    const endTag = `<!-- END:${section} -->`
    const start = partial.indexOf(beginTag)
    const end = partial.indexOf(endTag)
    if (start === -1 || end === -1) {
      throw new Error(`shared-chrome partial is missing section "${section}" (looked for ${beginTag} / ${endTag})`)
    }
    const sectionHtml = partial.slice(start + beginTag.length, end).trim()
    out = out.split(marker).join(sectionHtml)
  }
  return out
}

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
          res.end(injectSharedChrome(readFileSync(filePath, 'utf-8')))
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
