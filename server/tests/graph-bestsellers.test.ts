import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rankGraphSales} from '../../shared/graphBestsellers.js';
const sale = (id: string, listingId: string, buyer: string) => ({id, listingId, buyer, seller:'seller', amount:'1',currency:'USDC',transactionHash:'tx',timestamp:'2026-09-11'});
test('ranks sales, deduplicates event IDs and counts distinct buyer wallets', () => {
 const rows=[sale('1','a','0xAB'),sale('2','a','0xab'),sale('3','b','0x1'),sale('4','b','0x2')];
 const ranks=rankGraphSales([...rows,rows[0]]);
 assert.equal(ranks.length,2);
 assert.equal(ranks[0].listingId,'b');
 assert.equal(ranks[0].sales,2);
 assert.equal(ranks[0].uniqueBuyers,2);
 assert.equal(ranks[1].sales,2);
 assert.equal(ranks[1].uniqueBuyers,1);
 assert.deepEqual(rankGraphSales([]),[]);
});
