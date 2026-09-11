# Vercel deployment

The root Vercel project uses the Vite preset, `npm run build`, and `dist` output. `api/index.ts` exposes the Hono server as a Node function; `vercel.json` routes API requests and frontend page refreshes. Runtime styles, fonts, and images live in `public/site`. `config/site-assets.json` lists the 39 assets currently used by the app; the build checks that list against the directory. Update the manifest and `.gitignore` together when adding an asset. The original static pages and unused artwork stay in the ignored `portfolio-html-template` archive, outside Vite’s public directory.

Set nonempty values in Vercel Project Settings → Environment Variables for the environments you deploy. Adding names with empty values is not sufficient.

- `VITE_THIRDWEB_CLIENT_ID`: Thirdweb client ID, embedded during the frontend build. Set it in Vercel; do not commit it. Never use a Thirdweb secret key here. Allow `margit.vercel.app` in the Thirdweb client's domain settings. An empty value fails the build.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: GitHub OAuth app credentials.
- `APP_URL`: `https://margit.vercel.app`.
- `GITHUB_REDIRECT_URI`: `https://margit.vercel.app/api/auth/github/callback`. Set this exact callback on the GitHub OAuth app too.
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `TOKEN_ENCRYPTION_KEY`: persistent storage and encryption. Keep the existing encryption key if reusing the existing database, or stored credentials cannot be decrypted.
- Configure the payment, agent, fee, and Graph runtime settings described in `.env.example` for the features being enabled. Keep private keys and API tokens server-side; never prefix them with `VITE_`.

Redeploy after changing environment values, especially `VITE_*` variables. The build fails with a clear message if the Thirdweb client ID is missing.

After deployment, check `/`, a direct page URL such as `/catalog`, `/site/css/main.min.css`, and `/api/listings`. Check GitHub login separately using the production OAuth callback. A successful static build alone does not verify payment execution or repository delivery.

## API and documentation domains

Add `api.margit.sh` and `docs.margit.sh` to the same Vercel project as `margit.sh`, and apply the DNS records Vercel provides. Keep `APP_URL=https://margit.sh` and the existing GitHub OAuth callback unchanged. Deploy the host-routing changes before using these domains.

- `https://docs.margit.sh/` serves the static developer documentation.
- `https://api.margit.sh/` returns API discovery JSON.
- API paths support both `/api/listings` and `/listings` on the API host.
- Existing `margit.sh/api/*` and `margit.sh/docs/` URLs remain available.
- The dapp continues using same-origin requests and cookies. The API domain does not share the dapp's browser session; use documented bearer credentials for seller API operations.

Bazantic form: base URL `https://api.margit.sh`, docs URL `https://docs.margit.sh/`, spec URL `https://api.margit.sh/api/agent-docs/openapi.json`. The spec retains `/api/*` paths.
