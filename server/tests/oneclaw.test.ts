import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyOneClaw} from '../src/oneclaw.js';

test('1Claw probe rejects invalid input before sending credentials', async () => {
    await assert.rejects(verifyOneClaw({agentId:'bad',apiKey:'not-agent-key',address:'bad'}), /valid agent ID/);
});
test('1Claw authentication errors do not expose remote response secrets', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response('sensitive provider response', {status:401});
    try {
        await assert.rejects(verifyOneClaw({agentId:'00000000-0000-0000-0000-000000000000',apiKey:'ocv_test',address:'0x0000000000000000000000000000000000000001'}), error => error instanceof Error && error.message.includes('401') && !error.message.includes('sensitive'));
    } finally {globalThis.fetch = original;}
});
