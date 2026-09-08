import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,parseAbiParameters,encodeFunctionData} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {checkoutAbi} from '../../shared/checkout.js';
process.env.KV_REST_API_URL='https://example.invalid';process.env.KV_REST_API_TOKEN='test';process.env.TOKEN_ENCRYPTION_KEY='ab'.repeat(32);process.env.APP_URL='https://margit.example';
process.env.CHECKOUT_CONTRACT_ADDRESS='0x1111111111111111111111111111111111111111';
process.env.CHECKOUT_SIGNER_PRIVATE_KEY=`0x${'12'.repeat(32)}`;
const signer=privateKeyToAccount(process.env.CHECKOUT_SIGNER_PRIVATE_KEY as `0x${string}`);
const {encryptToken}=await import('../src/crypto.js');
const {createCheckoutQuote,completeCheckout}=await import('../src/checkout.js');
const {listPurchaseHistory}=await import('../src/purchases.js');
const data=new Map<string,any>();
const buyer='0x2222222222222222222222222222222222222222';
const seller='0x3333333333333333333333333333333333333333';
const hash=`0x${'45'.repeat(32)}`;
const blockHash=`0x${'67'.repeat(32)}`;
let receipt:any;
let deliveryOk=true;
let btcAllowed=true;
let timestamp=Math.floor(Date.now()/1000);
beforeEach(()=>{
 data.clear();deliveryOk=true;btcAllowed=true;timestamp=Math.floor(Date.now()/1000);
 data.set('margit:listing:test',{id:'test',ownerLogin:'seller',repoFullName:'seller/repo',price:'$1.00',payoutAddress:seller,accessPolicy:{mode:'single_download',minutes:10},encryptedOwnerToken:encryptToken('seller-secret')});
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://example.invalid')){
   const commands=JSON.parse(String(init?.body));
   const run=([command,key,value,...options]:any[])=>{
    let result:any;
    if(command==='get')result=data.has(key)?Buffer.from(JSON.stringify(data.get(key))).toString('base64'):null;
    else if(command==='set'){if(options.includes('nx')&&data.has(key))result=null;else{let decoded;try{decoded=JSON.parse(value)}catch{decoded=value}data.set(key,decoded);result='OK'}}
    else if(command==='sadd'){const set=new Set(data.get(key)??[]);set.add(value);data.set(key,[...set]);result=1}
    else if(command==='smembers')result=(data.get(key)??[]).map((v:string)=>Buffer.from(v).toString('base64'));
    else throw new Error(`Unexpected Redis command ${command}`);
    return {result};
   };
   return Response.json(Array.isArray(commands[0])?commands.map(run):run(commands));
  }
  if(String(url).includes('api.coinbase.com')) return Response.json({data:{base:'BTC',currency:'USD',amount:'100000.00'}});
  if(String(url).includes('api.frankfurter.dev')) return Response.json({base:'USD',quote:'EUR',rate:0.875,date:new Date().toISOString().slice(0,10)});
  if(String(url).includes('github.com'))return new Response('archive',{status:deliveryOk?200:401});
  const req=JSON.parse(String(init?.body));let result;
  if(req.method==='eth_call')result=req.params[0].data.startsWith(encodeFunctionData({abi:checkoutAbi,functionName:'allowedToken',args:[buyer]}).slice(0,10)) ? encodeAbiParameters(parseAbiParameters('bool'),[btcAllowed]) : encodeAbiParameters(parseAbiParameters('address'),[signer.address]);
  else if(req.method==='eth_getTransactionReceipt')result=receipt;
  else if(req.method==='eth_getBlockByHash')result={hash:blockHash,number:'0x1',timestamp:`0x${timestamp.toString(16)}`,transactions:[]};
  else throw new Error(`Unexpected RPC ${req.method}`);
  return Response.json({jsonrpc:'2.0',id:req.id,result});
 };
});
function receiptFor(quote:any){const o=quote.order;return {transactionHash:hash,transactionIndex:'0x0',blockHash,blockNumber:'0x1',from:buyer,to:quote.contract,cumulativeGasUsed:'0x1',gasUsed:'0x1',effectiveGasPrice:'0x1',status:'0x1',type:'0x2',logsBloom:`0x${'00'.repeat(256)}`,logs:[{address:quote.contract,topics:encodeEventTopics({abi:checkoutAbi,eventName:'PurchaseCompleted',args:{purchaseId:o.orderId,listingId:o.listingId,buyer:o.buyer}}),data:encodeAbiParameters(parseAbiParameters('address,address,uint256,bytes32'),[o.seller,o.token,BigInt(o.amount),o.termsHash]),blockHash,blockNumber:'0x1',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x0',removed:false}]};}
test('quote fails closed when delivery is unavailable',async()=>{deliveryOk=false;await assert.rejects(createCheckoutQuote('test',buyer,'USDC'),/cannot be delivered/);});
test('receipt recovery is idempotent and uses original onchain purchase time',async()=>{
 const q=await createCheckoutQuote('test',buyer,'USDC');receipt=receiptFor(q);
 const first=await completeCheckout(q.claimSecret,hash);
 const again=await completeCheckout(q.claimSecret,hash);
 assert.equal(first.cloneUrl,again.cloneUrl);assert.equal(first.expiresAt,new Date((timestamp+600)*1000).toISOString());
 const history=await listPurchaseHistory('buyer',buyer);assert.equal(history.length,1);assert.equal(history[0].onchainPurchaseId,q.order.orderId);
 assert.ok(!JSON.stringify(history).includes(q.claimSecret));assert.ok(!JSON.stringify(history).includes('seller-secret'));
 // A listing edit must not change the amount/terms already paid for.
 data.get('margit:listing:test').price='$20.00';
 assert.equal((await completeCheckout(q.claimSecret,hash)).expiresAt,first.expiresAt);
 assert.equal((await listPurchaseHistory('buyer',buyer))[0].amount,'1.00');
});
test('public transaction hash cannot unlock without its private claim; mismatched receipts are rejected',async()=>{
 const q=await createCheckoutQuote('test',buyer,'USDC');receipt=receiptFor(q);
 await assert.rejects(completeCheckout('ff'.repeat(32),hash),/not found/);
 receipt.logs[0].address=seller;await assert.rejects(completeCheckout(q.claimSecret,hash),/does not match/);
 receipt=receiptFor(q);receipt.logs[0].topics[3]=encodeAbiParameters(parseAbiParameters('address'),[seller]);await assert.rejects(completeCheckout(q.claimSecret,hash),/does not match/);
 receipt=receiptFor(q);receipt.status='0x0';await assert.rejects(completeCheckout(q.claimSecret,hash),/did not succeed/);
 assert.equal((await listPurchaseHistory('buyer',buyer)).length,0);
});

test('contract fees are recorded once and never accrue as deferred debt',async()=>{
 const {sellerFees}=await import('../src/fees.js');
 const q=await createCheckoutQuote('test',buyer,'USDC');receipt=receiptFor(q);
 receipt.logs.push({...receipt.logs[0],logIndex:'0x1',topics:encodeEventTopics({abi:checkoutAbi,eventName:'PurchaseFeeCollected',args:{purchaseId:q.order.orderId,token:q.order.token,treasury:signer.address}}),data:encodeAbiParameters(parseAbiParameters('uint256,uint256'),[5000n,995000n])});
 await completeCheckout(q.claimSecret,hash);await completeCheckout(q.claimSecret,hash);
 const sales=await listPurchaseHistory('seller','seller');
 assert.equal(sales.length,1);assert.equal(sales[0].platformFee,'0.005');assert.equal(sales[0].sellerNet,'0.995');
 const summary=await sellerFees('seller',sales);
 assert.equal(summary[0].collected,'0.005');assert.equal(summary[0].owed,'0');
});

test('x402 fees accrue once after launch, settlement credits are publisher-bound and idempotent',async()=>{
 const {recordPurchase}=await import('../src/purchases.js');
 const {sellerFees,confirmFeePayment}=await import('../src/fees.js');
 const {sellerFeeId}=await import('../../shared/fees.js');
 process.env.PLATFORM_FEES_STARTED_AT=new Date(timestamp*1000).toISOString();
 process.env.FEE_CONTRACT_ADDRESS=process.env.CHECKOUT_CONTRACT_ADDRESS;
 const listing=data.get('margit:listing:test');
 const access={cloneUrl:'https://margit.example/access',expiresAt:new Date(Date.now()+600000).toISOString()};
 const payment={reference:'x402:fee-test',buyerWallet:buyer,currency:'USDC' as const,channel:'x402' as const,purchasedAt:timestamp*1000};
 await recordPurchase(listing,payment,access);await recordPurchase(listing,payment,access);
 await recordPurchase(listing,{...payment,reference:'x402:old',purchasedAt:timestamp*1000-1000},access);
 const sales=await listPurchaseHistory('seller','seller');
 assert.equal(sales.length,2);
 assert.equal((await sellerFees('seller',sales))[0].owed,'0.005');
 const q=await createCheckoutQuote('test',buyer,'USDC');receipt=receiptFor(q);
 receipt.logs=[{...receipt.logs[0],topics:encodeEventTopics({abi:checkoutAbi,eventName:'DeferredFeesPaid',args:{sellerId:sellerFeeId('seller'),payer:buyer}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[5000n])}];
 await assert.rejects(confirmFeePayment('someone-else',hash),/No fee payment/);
 receipt.status='0x0';await assert.rejects(confirmFeePayment('seller',hash),/failed/);receipt.status='0x1';
 const originalAddress=receipt.logs[0].address;receipt.logs[0].address=buyer;
 await assert.rejects(confirmFeePayment('seller',hash),/No fee payment/);receipt.logs[0].address=originalAddress;
 await confirmFeePayment('seller',hash);await confirmFeePayment('seller',hash);
 const summary=(await sellerFees('seller',sales))[0];
 assert.equal(summary.paid,'0.005');assert.equal(summary.owed,'0');assert.equal(summary.collected,'0');
 delete process.env.PLATFORM_FEES_STARTED_AT;
});

test('EURC quote, confirmation and history use the converted amount and fees',async()=>{
 const q=await createCheckoutQuote('test',buyer,'EURC');
 assert.equal(q.order.amount,'875000');
 receipt=receiptFor(q);
 receipt.logs.push({...receipt.logs[0],logIndex:'0x1',topics:encodeEventTopics({abi:checkoutAbi,eventName:'PurchaseFeeCollected',args:{purchaseId:q.order.orderId,token:q.order.token,treasury:signer.address}}),data:encodeAbiParameters(parseAbiParameters('uint256,uint256'),[4375n,870625n])});
 const result=await completeCheckout(q.claimSecret,hash);
 assert.equal(result.amount,'0.875');
 const [sale]=await listPurchaseHistory('seller','seller');
 assert.equal(sale.amount,'0.875');assert.equal(sale.currency,'EURC');assert.equal(sale.platformFee,'0.004375');assert.equal(sale.sellerNet,'0.870625');
});


test('cirBTC requires seller opt-in and contract support before a payable quote',async()=>{
 await assert.rejects(createCheckoutQuote('test',buyer,'cirBTC'),/does not accept/);
 data.get('margit:listing:test').accessPolicy.acceptCirBTC=true;
 btcAllowed=false;
 await assert.rejects(createCheckoutQuote('test',buyer,'cirBTC'),/not enabled/);
});
test('cirBTC receipts use eight decimals and preserve purchased permanent terms after edits',async()=>{
 const listing=data.get('margit:listing:test');
 listing.accessPolicy={mode:'permanent',minutes:10,acceptCirBTC:true};
 const q=await createCheckoutQuote('test',buyer,'cirBTC');
 assert.equal(q.order.amount,'1000');
 receipt=receiptFor(q);
 receipt.logs.push({...receipt.logs[0],logIndex:'0x1',topics:encodeEventTopics({abi:checkoutAbi,eventName:'PurchaseFeeCollected',args:{purchaseId:q.order.orderId,token:q.order.token,treasury:signer.address}}),data:encodeAbiParameters(parseAbiParameters('uint256,uint256'),[5n,995n])});
 listing.accessPolicy={mode:'single_download',minutes:10};
 const result=await completeCheckout(q.claimSecret,hash);
 assert.equal(result.amount,'0.00001');assert.equal(result.expiresAt,null);
 const [sale]=await listPurchaseHistory('seller','seller');
 assert.equal(sale.accessPolicy.mode,'permanent');assert.equal(sale.currency,'cirBTC');
 assert.equal(sale.platformFee,'0.00000005');assert.equal(sale.sellerNet,'0.00000995');
 const {summarizeFees}=await import('../src/fees.js');
 const summary=summarizeFees([sale],[]).find(s=>s.currency==='cirBTC')!;
 assert.equal(summary.gross,'0.00001');assert.equal(summary.collected,'0.00000005');assert.equal(summary.net,'0.00000995');
 assert.equal((await completeCheckout(q.claimSecret,hash)).cloneUrl,result.cloneUrl);
});

test('quotes and public prices reject all seller-disabled currencies',async()=>{
 const {checkoutRoutes}=await import('../src/checkout.js');
 for(const acceptedTokens of [['USDC'],['EURC'],['cirBTC']] as const) {
  data.get('margit:listing:test').accessPolicy={mode:'window',minutes:10,acceptedTokens,checkout:'wallet'};
  for(const currency of ['USDC','EURC','cirBTC'] as const) {
   const price=await checkoutRoutes.request(`http://localhost/price?listingId=test&currency=${currency}`);
   if(currency===acceptedTokens[0]) {
    assert.equal(price.status,200);
    assert.ok(await createCheckoutQuote('test',buyer,currency));
   } else {
    assert.equal(price.status,400);
    await assert.rejects(createCheckoutQuote('test',buyer,currency),new RegExp(`does not accept ${currency}`));
   }
  }
 }
});
