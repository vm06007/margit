import test from 'node:test';
import assert from 'node:assert/strict';
import { withRequestTimeout } from '../../../shared/requestTimeout.js';

test('stalled request is aborted with a useful error and no retry', async () => {
    let attempts = 0;
    await assert.rejects(withRequestTimeout(signal => {
        attempts++;
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }, 10, 'Request timed out'), /Request timed out/);
    assert.equal(attempts, 1);
});

test('deadline covers a stalled response body', async () => {
    await assert.rejects(withRequestTimeout(async signal => {
        const response = new Response(new ReadableStream({
            start(controller) {
                signal.addEventListener('abort', () => controller.error(new Error('aborted')));
            },
        }));
        return response.json();
    }, 10, 'Body timed out'), /Body timed out/);
});

test('successful requests and ordinary errors are preserved', async () => {
    assert.equal(await withRequestTimeout(async () => 'done', 100, 'timeout'), 'done');
    await assert.rejects(withRequestTimeout(async () => { throw new Error('GitHub unavailable'); }, 100, 'timeout'), /GitHub unavailable/);
});
