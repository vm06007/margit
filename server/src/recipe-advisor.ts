import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const RECIPE_HANDLE = 'margit-repository-advisor';
// Returned by https://api.bazantic.com/mcp initialize on 2026-09-12.
export const RECIPE_ENDPOINT = 'https://jtc64fcl6jbgzbohqrkfeu4may.bazgateway.com/recipe-mcp';
const inputSchema = z.object({
    requirements: z.string().trim().min(10).max(2000),
    max_budget_usd: z.number().finite().min(0).max(1_000_000),
    comparison_repositories: z.string().trim().max(500).optional(),
}).strict();

export function parseAdvisorInput(value: unknown) {
    const input = inputSchema.parse(value);
    const repos = [...new Set((input.comparison_repositories || '').split(',').map(v => v.trim()).filter(Boolean))];
    if (repos.length > 3 || repos.some(v => !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(v))) {
        throw new Error('Enter up to three public repositories as owner/repo, separated by commas.');
    }
    return { requirements: input.requirements, max_budget_usd: input.max_budget_usd,
        ...(repos.length ? { comparison_repositories: repos.join(', ') } : {}) };
}

export function parseRecipeResponse(body: string) {
    let envelope;
    try { envelope = JSON.parse(body); }
    catch {
        const messages = body.split(/\r?\n\r?\n/).map(block => block.split(/\r?\n/)
            .filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n'));
        for (const data of messages) {
            try { const item = JSON.parse(data); if (item.id === 1) envelope = item; } catch { /* SSE keepalive */ }
        }
    }
    if (!envelope || envelope.error || envelope.result?.isError) throw new Error('Recipe execution failed. Please try again later.');
    const result = envelope.result;
    let output = result?.structuredContent?.output;
    if (output === undefined) {
        const text = result?.content?.filter((v: { type: string }) => v.type === 'text').map((v: { text: string }) => v.text).join('\n');
        try { output = JSON.parse(text).output ?? text; } catch { output = text; }
    }
    if (output === undefined || output === null || output === '') throw new Error('The Recipe returned no advice.');
    return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
}

type Dependencies = { fetcher?: typeof fetch; allow: (key: string) => Promise<boolean>; appUrl: string };
export function createAdvisorRoutes({ fetcher = fetch, allow, appUrl }: Dependencies) {
    const router = new Hono();
    router.post('/', async c => {
        c.header('Cache-Control', 'no-store');
        const origin = c.req.header('origin');
        if (origin && origin !== new URL(appUrl).origin) return c.json({ error: 'Request origin is not allowed.' }, 403);
        if (!c.req.header('content-type')?.includes('application/json')) return c.json({ error: 'JSON input is required.' }, 415);
        let input;
        try {
            const body = await c.req.text();
            if (body.length > 12_000) return c.json({ error: 'Input is too large.' }, 413);
            input = parseAdvisorInput(JSON.parse(body));
        } catch { return c.json({ error: 'Enter requirements (10–2,000 characters), a nonnegative budget, and at most three owner/repo comparisons.' }, 400); }
        try {
            const ip = c.req.header('x-vercel-forwarded-for') || c.req.header('x-forwarded-for') || 'local';
            const key = createHash('sha256').update(ip.split(',')[0].trim()).digest('hex');
            if (!await allow(key)) { c.header('Retry-After', '60'); return c.json({ error: 'Advice requests are busy or limited. Please wait a minute before trying again.' }, 429); }
            const started = Date.now();
            const response = await fetcher(RECIPE_ENDPOINT, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: RECIPE_HANDLE, arguments: input } }),
                signal: AbortSignal.timeout(75_000), redirect: 'error',
            });
            if (response.status === 402) return c.json({ error: 'Bazantic now requires payment for this Recipe. No payment was made. Please use the Recipe dashboard while payment support is configured.' }, 402);
            if (!response.ok) return c.json({ error: response.status === 429 ? 'Bazantic is busy. Try again shortly.' : 'The Recipe service is unavailable. Please try again later.' }, 502);
            const output = parseRecipeResponse(await response.text());
            return c.json({ output, recipe: RECIPE_HANDLE, duration_ms: Date.now() - started, completed_at: new Date().toISOString() });
        } catch (error) {
            const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
            return c.json({ error: timeout ? 'The Recipe took too long. Please try a shorter request.' : 'The Recipe could not complete. Please try again later.' }, timeout ? 504 : 502);
        }
    });
    return router;
}
