import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect } from 'vite'

const docsRoute: Connect.NextHandleFunction = (req, _res, next) => {
    if (/^\/docs\/?(?:\?|$)/.test(req.url ?? '')) {
        req.url = (req.url ?? '').replace(/^\/docs\/?/, '/docs/index.html');
    }
    next();
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    if (!(process.env.VITE_THIRDWEB_CLIENT_ID ?? env.VITE_THIRDWEB_CLIENT_ID)?.trim()) {
        throw new Error(
            "Set VITE_THIRDWEB_CLIENT_ID in the deployment environment before building. This is not committed to the repo.",
        );
    }
    return {
        plugins: [react(), {
            name: 'margit-docs-route',
            configureServer(server) { server.middlewares.use(docsRoute); },
            configurePreviewServer(server) { server.middlewares.use(docsRoute); },
        }],
        server: {
            proxy: {
                '/api': {
                    target: 'http://localhost:8788',
                    changeOrigin: true,
                },
            },
            watch: {
                // Keep the archived vendor template outside the dev watcher.
                ignored: ['**/portfolio-html-template/**'],
            },
        },
    };
})
