import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdvisorRoutes, parseAdvisorInput, parseRecipeResponse, RECIPE_ENDPOINT } from '../recipe-advisor.js';
const input = { requirements: 'A TypeScript dependency tool', max_budget_usd: 0.04 };
test('omitted comparisons stay omitted; duplicates normalize; invalid inputs fail', () => {
    assert.deepEqual(parseAdvisorInput({ ...input, comparison_repositories: ' ' }), input);
    assert.equal(parseAdvisorInput({ ...input, comparison_repositories: 'a/b, a/b' }).comparison_repositories, 'a/b');
    for (const v of [{ ...input, max_budget_usd: -1 }, { ...input, comparison_repositories: 'https://github.com/a/b' }, { ...input, requirements: 'short' }, { ...input, endpoint: 'https://evil.example' }]) assert.throws(() => parseAdvisorInput(v));
});
test('parses JSON and SSE MCP envelopes, rejects failed tools', () => {
    const envelope = { id: 1, result: { structuredContent: { output: 'Advice' } } };
    assert.equal(parseRecipeResponse(JSON.stringify(envelope)), 'Advice');
    assert.equal(parseRecipeResponse('event: message\ndata: ' + JSON.stringify(envelope) + '\n\n'), 'Advice');
    assert.equal(parseRecipeResponse(JSON.stringify({result:{content:[{type:'text',text:'{"output":{"answer":"yes"}}'}]}})), '{\n  "answer": "yes"\n}');
    assert.throws(() => parseRecipeResponse('{"result":{"isError":true}}'));
});
test('fixed published Recipe call forwards validated inputs without credentials', async () => {
    let calls = 0;
    const router = createAdvisorRoutes({ appUrl: 'https://margit.sh', allow: async () => true, fetcher: (async (url, init) => {
        calls++; assert.equal(url, RECIPE_ENDPOINT);
        assert.equal(new Headers(init?.headers).has('Authorization'), false);
        assert.deepEqual(JSON.parse(String(init?.body)).params.arguments, input);
        return new Response(JSON.stringify({ result: { structuredContent: { output: 'Over budget' } } }));
    }) as typeof fetch });
    const response = await router.request('/', {method:'POST',headers:{'Content-Type':'application/json',origin:'https://margit.sh'},body:JSON.stringify(input)});
    assert.equal(response.status,200); assert.equal((await response.json()).output,'Over budget'); assert.equal(calls,1);
});
test('blocks foreign origins and rate limits; never pays or retries 402', async () => {
    let calls = 0;
    const fetcher = (async () => {calls++;return new Response('payment',{status:402});}) as typeof fetch;
    const init = {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)};
    const router = createAdvisorRoutes({appUrl:'https://margit.sh',allow:async()=>true,fetcher});
    assert.equal((await router.request('/',{...init,headers:{...init.headers,origin:'https://evil.example'}})).status,403);
    assert.equal(calls,0);
    assert.equal((await router.request('/',init)).status,402); assert.equal(calls,1);
    const limited=createAdvisorRoutes({appUrl:'https://margit.sh',allow:async()=>false,fetcher});
    assert.equal((await limited.request('/',init)).status,429);assert.equal(calls,1);
});
