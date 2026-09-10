import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import { resolveAgentWallet, selectAgentWallet, walletStorage } from '../src/agent-wallet.js';
import { startCircleLogin, finishCircleLogin, circleStorage } from '../src/circle-managed.js';
import { buyWithManagedCircle } from '../src/circle-managed-payment.js';

const identity = { address: `0x${'1'.repeat(40)}`, buyer: `0x${'2'.repeat(40)}` };
test('Circle mode does not fall back to the demo private key', async () => {
  const mode = mock.method(walletStorage, 'get', async () => 'circle');
  const get = mock.method(circleStorage, 'get', async () => identity);
  try {
    const wallet = await resolveAgentWallet('visitor-a');
    assert.equal(wallet.mode, 'circle');
    assert.equal(wallet.privateKey, undefined);
    assert.equal(wallet.buyer, identity.buyer);
  } finally { get.mock.restore(); mode.mock.restore(); }
});
test('An unconnected visitor cannot select another visitor’s Circle wallet', async () => {
  const get = mock.method(circleStorage, 'get', async () => null);
  const set = mock.method(walletStorage, 'set', async () => { throw new Error('must not save mode'); });
  try { await assert.rejects(selectAgentWallet('visitor-b', 'circle'), /Connect your Circle/); }
  finally { get.mock.restore(); set.mock.restore(); }
});
test('OTP is not sent without explicit terms acceptance', async () => {
  await assert.rejects(startCircleLogin('visitor-a', 'person@example.com', false), /accept Circle/);
  await assert.rejects(startCircleLogin('visitor-a', '--testnet', true), /valid email/);
  await assert.rejects(finishCircleLogin('visitor-a', 'invalid'), /code from Circle/);
});
test('An uncertain payment cannot be paid twice', async () => {
  const get = mock.method(circleStorage, 'get', async (key: string) => key.endsWith(':identity') ? identity : 'pending');
  try { await assert.rejects(buyWithManagedCircle('visitor-a', 'repo'), /No second payment/); }
  finally { get.mock.restore(); }
});
