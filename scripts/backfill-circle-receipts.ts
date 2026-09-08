import { createHash } from 'node:crypto';
import { circleReceiptUrl } from '../shared/paymentReceipt.js';
import { purchaseId } from '../server/src/purchases.js';
import { redis } from '../server/src/redis.js';
import { moneyUnits } from '../shared/fees.js';
import type { Purchase } from '../shared/purchase.js';

// Reconcile only independently returned Circle receipts against their signed
// nonce-derived purchase IDs. Does not change amounts, fees, access, or status.
for (const reference of process.argv.slice(2)) {
    const url = circleReceiptUrl(reference);
    if (!url) throw new Error('Expected a Circle transfer UUID');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Circle lookup failed (${response.status})`);
    const receipt = await response.json() as {id:string;nonce:string;fromAddress:string;amount:string;token:string;sendingNetwork:string;recipientNetwork:string};
    if (receipt.id !== reference || !/^0x[0-9a-f]{64}$/i.test(receipt.nonce) || !/^0x[0-9a-f]{40}$/i.test(receipt.fromAddress)
        || receipt.token !== 'USDC' || receipt.sendingNetwork !== 'eip155:5042002' || receipt.recipientNetwork !== 'eip155:5042002') throw new Error('Unexpected Circle receipt');
    const fingerprint = createHash('sha256').update(`${receipt.fromAddress.toLowerCase()}:${receipt.nonce}`).digest('hex');
    const key = `margit:purchase:${purchaseId(`x402:${fingerprint}`)}`;
    const purchase = await redis.get<Purchase>(key);
    if (!purchase || purchase.channel !== 'x402' || purchase.currency !== 'USDC' || purchase.buyerWallet !== receipt.fromAddress.toLowerCase()
        || moneyUnits(purchase.amount) !== BigInt(receipt.amount)) throw new Error('Receipt does not match a stored purchase');
    await redis.eval(`local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local p=cjson.decode(raw); if p.gatewayReference and p.gatewayReference~=ARGV[1] then return redis.error_reply('Conflicting receipt') end; p.gatewayReference=ARGV[1]; redis.call('SET',KEYS[1],cjson.encode(p)); return 1`,[key],[reference]);
    console.log(JSON.stringify({repo:purchase.repoFullName,reference,status:'linked'}));
}
