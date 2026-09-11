import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildGraphLeaderboard} from '../../shared/graphLeaderboard.js';
import type {GraphActivity} from '../../shared/graphActivity.js';
const now = Date.parse('2026-09-11T12:00:00Z');
const sale = (id:string, buyer:string, seller:string, amount:string, currency:string, timestamp = '2026-09-10T12:00:00Z'): GraphActivity['sales'][number] => ({id,buyer,seller,amount,currency,timestamp,listingId:'repo',transactionHash:'tx',repository:'owner/repo',inCatalog:true});
test('leaderboards deduplicate events, normalize wallet casing and keep currencies exact',()=>{
 const first=sale('1','0xAB','0xCD','0.1','USDC');
 const stats=buildGraphLeaderboard({available:true,sales:[first,first,sale('2','0xab','0xcd','0.2','USDC'),sale('3','0xef','0xcd','2','EURC')]},'all',now);
 assert.equal(stats.purchases,3); assert.equal(stats.uniqueBuyers,2); assert.equal(stats.uniqueSellers,1);
 assert.equal(stats.buyers[0].purchases,2); assert.equal(stats.sellers[0].uniqueCounterparties,2);
 assert.deepEqual(stats.volumes,[{currency:'USDC',amount:'0.3'},{currency:'EURC',amount:'2'}]);
 assert.equal(stats.daily.find(d=>d.date==='2026-09-10')?.purchases,3);
});
test('period filters, future dates, missing names and coverage are represented accurately',()=>{
 const data:GraphActivity={available:true,sales:[sale('1','a','b','1','USDC','2026-08-20T12:00:00Z'),sale('2','a','b','1','USDC','2026-09-12T12:00:00Z')]};
 assert.equal(buildGraphLeaderboard(data,'7d',now).purchases,0);
 assert.equal(buildGraphLeaderboard(data,'30d',now).purchases,1);
 assert.equal(buildGraphLeaderboard({available:false,message:'Unavailable',sales:[]},'all',now).available,false);
 const capped=buildGraphLeaderboard({available:true,sales:Array.from({length:1000},(_,i)=>sale(String(i),'a','b','1','USDC'))},'all',now);
 assert.equal(capped.capped,true); assert.equal(capped.sampleSize,1000);
});
