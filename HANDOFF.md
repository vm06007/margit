# Handoff / Resume Notes

Internal checkpoint for whoever (human or agent) picks this up next. `README.md` is the polished public-facing doc — this file is the raw "here's exactly where we left off" version: decisions, gotchas, and what's genuinely unfinished.

Written 2026-09-07, mid-hackathon (ETHGlobal ETHOnline 2026, deadline late September).

## How to resume this exact session

If you're Claude Code and this file was read because a session got interrupted: the original conversation can likely be resumed with `claude --continue` or `claude --resume` from this directory (`/Users/vm06007/Development/margit`) — full context, no need to reconstruct anything from this file if that works. This file exists for the case where that's not available (new session, different agent, or the user wants a clean restart).

## Ground truth, not memory

Everything below was true as of the last verification in-session. **Before acting on any of it, re-check the actual code** — file paths, route names, env var names. This file can go stale; the repo can't.

---

## What's actually built (verified working)

- GitHub OAuth connect/disconnect/revoke, repo listing (list/make-private), listing CRUD — all in `server/src/index.ts` + `server/src/listings.ts`.
- Two independent, real payment paths for buying a listing:
  - **Direct**: plain ERC-20 transfer (USDC or EURC) + server-side on-chain verification via `viem` (`server/src/payments.ts`). Single-use tx hashes (Redis).
  - **x402 / agentic**: real `402` challenge settled through Circle's testnet Gateway facilitator (`server/src/x402-gateway.ts`, `@circle-fin/x402-batching`). Requires a one-time `deposit()` into the Gateway Wallet contract first — the `DepositButton` in `App.tsx` handles this using the real bundled ABI (found in `node_modules`, not guessed).
- ENS (`.eth`) and ArcNS (`.arc`/`.circle`) name resolution, both directions, `server/src/names.ts`.
- Agent sidebar (`AgentSidebar` in `src/App.tsx`, backend in `server/src/agent.ts`):
  - Switched from Anthropic-only to **OpenRouter** so any tool-calling-capable model works, default `openrouter/free` (OpenRouter's own auto-router for free models — chosen specifically because it won't go stale like pinning one named free model would).
  - 8 tools: `list_listings`, `get_listing`, `get_wallet_balance`, `buy_listing`, `list_my_repos`, `create_listing`, `unlist_repo`, `generate_api_key`.
  - Has its own funded Arc wallet (`ARC_DEMO_BUYER_PRIVATE_KEY`) — separate from any human buyer's connected wallet.
  - Settings panel (gear icon): per-visitor model override + bring-your-own OpenRouter key, encrypted at rest, same pattern as GitHub tokens.
  - Voice input via native `SpeechRecognition` (ambient types in `src/speech.d.ts`, no library).
  - When the agent lists/unlists a repo, the frontend now gets told (`listingChange` on the chat response) and updates `My Repos` live + flashes the affected card (`.repo-flash` CSS animation).
- Margit API keys (`server/src/api-keys.ts`) + `/api/agent-api/*` REST routes — lets an external agent (not just the sidebar) manage a *specific seller's* listings, given a key that seller generated. Built specifically as the target surface for a future Bazantic Gateway.
- Wallet connect UX: moved out of a standalone navbar button, now lives inside the profile dropdown (`ProfileDropdown` in `App.tsx`) — shows ArcNS name or shortened address when connected, opens thirdweb's real wallet-details modal (`useWalletDetailsModal`) on click, or the real connect modal (`useConnectModal`) when not connected.
- Catalog/My Repos both have a Cards/List view toggle (shared `ViewToggle` component).
- Copy-clone-command + server-proxied ZIP download after a purchase (`CloneResult` component + `/api/download-zip`).
- Static marketing homepage ported from `portfolio-html-template/HTML/index.html`, served at `/` via a **dev-only** Vite middleware plugin (`vite.config.ts`, `landingHomepage()` function). Nav, footer, hero, header/footer CTAs all rewritten to real margit copy and real routes. See "Not finished" below for what's still template leftover.

## Key architectural decisions (and why)

- **OpenRouter over a single vendor LLM API**: the user explicitly asked for "choose whatever [model], offer a free default, allow bring-your-own-key" — OpenRouter is one OpenAI-compatible API that covers all of that in one integration, rather than building separate Anthropic/OpenAI/etc. clients.
- **Two payment paths, not one**: Circle Gateway's deposit-then-settle model is great for agents paying repeatedly but a bad first-purchase UX for a human buying once ("gateway deposit solution is stupid" — direct user quote). Built both rather than picking one.
- **Seller API keys instead of wrapping raw GitHub API**: GitHub's own API needs a specific user's OAuth token — there's no way for an anonymous paying agent to prove it's acting as a specific seller through a generic pay-per-call gateway. Margit's own `/api/agent-api/*` (backed by a margit-issued key the seller generates themselves) solves the "prove who you're acting for" problem that wrapping GitHub directly can't.
- **Landing page served via dev middleware, not a React component**: originally built as a React `LandingPage` component; the user pivoted to serving the ported static HTML directly at `/` (bypassing React entirely for that route) for visual fidelity to the source template. The `LandingPage.tsx`/`landing.css` files were deleted; the Vite middleware approach replaced them. **This is dev-only** — no production equivalent has been built yet.
- **`public/landing/` is gitignored** — the user added this themselves (`.gitignore` line `/public/landing`). Don't try to commit it; that's an explicit decision, not an oversight.
- **`portfolio-html-template/` is gitignored too** — reference source only, not part of the app.

## Known bugs fixed this session (don't reintroduce)

- Sidebar used `overflow: hidden` (needed for its slide-open width animation) which silently breaks `position: sticky` on any child once page content exceeds one viewport height. Fixed by switching the whole page to a two-pane layout (`.app-row { height: 100vh; overflow: hidden }`, each side scrolls independently) instead of sticky-positioning the sidebar within a naturally-scrolling page.
- The navbar's `margit` logo used to intercept clicks and do a client-side SPA route change to `/`, which never triggers the server-side middleware that serves the static landing page (that only fires on a real HTTP request) — so users would see the SPA's dead internal `WelcomePage` fallback instead. Fixed by making the logo a plain `<a href="/">` with no `onClick` handler, forcing a real navigation.
- Agent status line used to say "(shared key)" even when `hasSharedDefault` was false — fixed to say "(no key configured)" honestly in that case.

## Not finished / explicitly deferred

- **Reviews/ratings**: UI placeholders only (`StarRating`, `ReviewsSection` in `App.tsx`), intentionally not faked. Decision on record: build on **ERC-8004** (Trustless Agents — Identity/Reputation/Validation registries) when there's time.
- **The Graph**: confirmed (with screenshots from the user, correcting an earlier wrong research finding) that Arc Testnet **is** a real, listed Subgraph Studio network. Nothing built yet — blocked on the user creating a new Subgraph Studio project scoped to Arc Testnet and sharing its Deploy Key. Likely target: index USDC/EURC `Transfer` events tied to listings.
- **Bazantic**: real, documented API confirmed live (`api.bazantic.com/docs`, `/openapi.json` — full CRUD for Gateways and Recipes). The `BAZANTIC_API_TOKEN` currently in `.env` is a **webapp session JWT and does NOT work** as an API key (`invalid_credentials` when tried against `api.bazantic.com`) — a real API key needs to come from the Bazantic dashboard's API-keys section (exact location not yet found/confirmed). Once obtained: register a Gateway wrapping `/api/listings` + `/api/listings/unlock` (public, no new code needed) and `/api/agent-api/*` (seller actions), then write a Recipe. Prize-track note: "Help an Agent Use Your Hackathon Project" is **continuity-track only — margit doesn't qualify**. "Best Recipe using Sponsor APIs" and "Agentify a new API" are both open, no restriction.
- **Landing page production serving**: the Vite middleware plugin only runs in `vite dev` — `npm run build` does nothing to serve `public/landing/index.html` at `/` in a production deploy. Needs a real solution before shipping (e.g. a static host rewrite rule, or a Hono route serving the file, depending on final deploy target).
- **Landing page body content**: nav, footer, hero, and all CTA buttons are real and wired to margit routes. The **mid-body sections are not** — they're still the source template's "here are our other template designs" showcase (image grids, a swiper carousel, ~40 dead links to template-demo `.html` pages that were never copied). Left alone on purpose (scoped out of the nav/footer rewrite pass) — a full content-authoring pass would need to replace these with real margit content (e.g. actual catalog screenshots) or remove them outright.
- **Arc mainnet**: not usable — Circle has not published mainnet contract addresses for Arc as of this build. Testnet only.

## Things to double-check before trusting them (verify-first list)

- Whether `OPENROUTER_API_KEY` and `ARC_DEMO_BUYER_PRIVATE_KEY`/`ARC_DEMO_BUYER_ADDRESS` in `.env` are still funded/valid — both were set up mid-session; balances may have changed.
- `DEFAULT_MODEL = "openrouter/free"` in `server/src/agent.ts` — confirmed live and free at write time, but OpenRouter's catalog changes; re-verify with `GET https://openrouter.ai/api/v1/models` if the agent starts behaving oddly.
- The exact current git status / what's committed vs. uncommitted — check `git log --oneline -10` and `git status` before assuming anything is pushed. Commits so far were made incrementally through the session with the user's explicit go-ahead each time; **do not push without asking** unless told otherwise for the specific batch of changes.

## Style/process notes the user has been explicit about

- Always include `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` in commit messages (was missed twice earlier in the session, user asked for it going forward).
- Never guess API shapes, contract addresses, or ABIs — verify from official docs or installed package source first. This caught several real bugs this session (wrong spend-control assumption, wrong Gateway deposit requirement, wrong assumption about Bazantic having no public API).
- Small, frequent, honestly-scoped commits — not structured to game hackathon anti-cheat/diff-size heuristics, just genuine logical units.
- Don't run a background dev server that competes with the user's own — they run `npm run dev` / `bun dev` themselves in their own terminal now; check `lsof -i :5173` / `:8788` before starting one, and kill any of your own before handing back control.
