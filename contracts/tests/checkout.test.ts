import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import solc from 'solc';
import { createPublicClient, createWalletClient, http, parseAbi, parseSignature, keccak256, stringToHex, zeroAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { checkoutAbi, checkoutDomain, orderTypes } from '../../shared/checkout.js';
const mnemonic = 'test test test test test test test test test test test junk';
const signer = mnemonicToAccount(mnemonic,{addressIndex:0});
const buyer = mnemonicToAccount(mnemonic,{addressIndex:1});
const seller = mnemonicToAccount(mnemonic,{addressIndex:2});
const other = mnemonicToAccount(mnemonic,{addressIndex:3});
const transport = http('http://127.0.0.1:18545');
const publicClient = createPublicClient({chain:foundry,transport});
const wallet = createWalletClient({account:signer,chain:foundry,transport});
const tokenAbi = parseAbi(['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)','function setFail(bool)','function setCallback(address,bytes)','function setRejectAddress(address)']);
let token:`0x${string}`, contract:`0x${string}`, otherContract:`0x${string}`;
const mock = `pragma solidity ^0.8.24;
contract Token {
 mapping(address=>uint) public balanceOf; mapping(address=>mapping(address=>uint)) public allowance;
 bool public fail; address target; bytes payload; address rejected;
 constructor(address buyer){balanceOf[buyer]=1000000000;}
 function approve(address to,uint amount) external returns(bool){allowance[msg.sender][to]=amount;return true;}
 function setFail(bool value) external {fail=value;}
 function setRejectAddress(address value) external {rejected=value;}
 function setCallback(address to,bytes calldata data) external {target=to;payload=data;}
 function transferFrom(address from,address to,uint amount) external returns(bool){
 if(fail || to==rejected)return false;
 if(target!=address(0)){(bool success,)=target.call(payload);require(!success,"reentered");}
 require(allowance[from][msg.sender]>=amount && balanceOf[from]>=amount,"funds");allowance[from][msg.sender]-=amount;balanceOf[from]-=amount;balanceOf[to]+=amount;return true;
 }
}`;
async function send(args:any){ const hash=await wallet.writeContract(args); const result=await publicClient.waitForTransactionReceipt({hash});assert.equal(result.status,'success');return result; }
let sequence=0;
async function order(overrides:any={}, domainContract=contract, domainChain=31337){
 const latest=await publicClient.getBlock();
 const value={orderId:keccak256(stringToHex(`order-${++sequence}`)),listingId:keccak256(stringToHex('listing')),termsHash:keccak256(stringToHex('terms')),buyer:buyer.address,seller:seller.address,token,amount:1000000n,deadline:latest.timestamp+300n,...overrides};
 const signature=parseSignature(await signer.signTypedData({domain:checkoutDomain(domainContract,domainChain),types:orderTypes,primaryType:'Order',message:value}));
 return {value,args:[value,Number(signature.v),signature.r,signature.s] as const};
}
before(async()=>{
 assert.equal(await publicClient.getChainId(),31337);
 const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Token.sol':{content:mock}},settings:{evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
 const artifact=output.contracts['Token.sol'].Token;
 const deploy=await wallet.deployContract({abi:artifact.abi,bytecode:`0x${artifact.evm.bytecode.object}`,args:[buyer.address]});
 token=(await publicClient.waitForTransactionReceipt({hash:deploy})).contractAddress!;
 const abi=JSON.parse(fs.readFileSync('contracts/artifacts/MargitCheckout.abi.json','utf8'));
 const bytecode=`0x${fs.readFileSync('contracts/artifacts/MargitCheckout.bytecode.txt','utf8').trim()}` as `0x${string}`;
 for(let i=0;i<2;i++){const hash=await wallet.deployContract({abi,bytecode,args:[other.address,token,signer.address]});const address=(await publicClient.waitForTransactionReceipt({hash})).contractAddress!;if(i===0)contract=address;else otherContract=address;}
 await send({account:buyer,address:token,abi:tokenAbi,functionName:'approve',args:[contract,1000000000n]});
});
test('payment goes to seller; receipt is emitted; order cannot be reused',async()=>{
 const o=await order();const before=await publicClient.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[seller.address]});
 const result=await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args});
 assert.equal(result.logs.filter(log=>log.address.toLowerCase()===contract.toLowerCase()).length,2);
 assert.equal(await publicClient.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[seller.address]}),before+o.value.amount-o.value.amount/200n);
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args}),/OrderUsed/);
});
test('rejects another buyer, changed price, expired quote, unsupported token and cross-domain signatures',async()=>{
 const o=await order();
 for(const [account,address,args,pattern] of [
  [other,contract,o.args,/WrongBuyer/],
  [buyer,contract,[{...o.value,amount:2000000n},...o.args.slice(1)],/InvalidSigner/],
  [buyer,otherContract,o.args,/InvalidSigner/],
  [buyer,contract,(await order({deadline:0n})).args,/OrderExpired/],
  [buyer,contract,(await order({token:zeroAddress})).args,/InvalidOrder/],
  [buyer,contract,(await order({},contract,5042002)).args,/InvalidSigner/],
 ] as any[]) await assert.rejects(publicClient.simulateContract({account,address,abi:checkoutAbi,functionName:'buy',args}),pattern);
});
test('failed transfer leaves order unused and can be retried',async()=>{
 const o=await order();await send({address:token,abi:tokenAbi,functionName:'setFail',args:[true]});
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args}),/TransferFailed/);
 assert.equal(await publicClient.readContract({address:contract,abi:checkoutAbi,functionName:'usedOrders',args:[o.value.orderId]}),false);
 await send({address:token,abi:tokenAbi,functionName:'setFail',args:[false]});
 await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args});
});

test('token callback cannot reenter checkout',async()=>{
 const {encodeFunctionData}=await import('viem');
 const o=await order();
 await send({address:token,abi:tokenAbi,functionName:'setCallback',args:[contract,encodeFunctionData({abi:checkoutAbi,functionName:'buy',args:o.args})]});
 await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args});
 await send({address:token,abi:tokenAbi,functionName:'setCallback',args:[zeroAddress,'0x']});
});

test('native USDC pays seller in one transaction, keeps six-decimal receipts and rejects wrong value',async()=>{
 const o=await order({token:other.address});
 const value=o.value.amount*10n**12n;
 const before=await publicClient.getBalance({address:seller.address});
 for(const incorrect of [0n,value-1n,value+1n]) {
  await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args,value:incorrect}),/InvalidNativeValue/);
 }
 const receipt=await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args,value});
 assert.equal(await publicClient.getBalance({address:seller.address}),before+value-value/200n);
 const {decodeEventLog}=await import('viem');
 const event=decodeEventLog({abi:checkoutAbi,data:receipt.logs[1].data,topics:receipt.logs[1].topics,eventName:'PurchaseCompleted'});
 assert.equal(event.args.amount,1000000n);
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args,value}),/OrderUsed/);
 const erc=await order();
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:erc.args,value:1n}),/InvalidNativeValue/);
});
test('native payment to a rejecting recipient leaves the order unused',async()=>{
 const o=await order({token:other.address,seller:token});
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args,value:o.value.amount*10n**12n}),/TransferFailed/);
 assert.equal(await publicClient.readContract({address:contract,abi:checkoutAbi,functionName:'usedOrders',args:[o.value.orderId]}),false);
});

test('deployer is admin; only admin can add or disable valid token contracts',async()=>{
 assert.equal((await publicClient.readContract({address:contract,abi:checkoutAbi,functionName:'admin'})).toLowerCase(),signer.address.toLowerCase());
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'setAllowedToken',args:[token,false]}),/Unauthorized/);
 for(const invalid of [zeroAddress,buyer.address]){
  await assert.rejects(publicClient.simulateContract({account:signer,address:contract,abi:checkoutAbi,functionName:'setAllowedToken',args:[invalid,true]}),/InvalidToken/);
 }
 const o=await order();
 await send({address:contract,abi:checkoutAbi,functionName:'setAllowedToken',args:[token,false]});
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args}),/InvalidOrder/);
 assert.equal(await publicClient.readContract({address:contract,abi:checkoutAbi,functionName:'usedOrders',args:[o.value.orderId]}),false);
 await send({address:contract,abi:checkoutAbi,functionName:'setAllowedToken',args:[token,true]});
 await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args});
});

test('admin transfer requires nominee acceptance and can be cancelled',async()=>{
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'transferAdmin',args:[buyer.address]}),/Unauthorized/);
 await assert.rejects(publicClient.simulateContract({account:signer,address:contract,abi:checkoutAbi,functionName:'transferAdmin',args:[zeroAddress]}),/InvalidAdmin/);
 await send({address:contract,abi:checkoutAbi,functionName:'transferAdmin',args:[buyer.address]});
 await assert.rejects(publicClient.simulateContract({account:other,address:contract,abi:checkoutAbi,functionName:'acceptAdmin'}),/Unauthorized/);
 assert.equal((await publicClient.readContract({address:contract,abi:checkoutAbi,functionName:'admin'})).toLowerCase(),signer.address.toLowerCase());
 await send({address:contract,abi:checkoutAbi,functionName:'cancelAdminTransfer'});
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'acceptAdmin'}),/Unauthorized/);
 await send({address:contract,abi:checkoutAbi,functionName:'transferAdmin',args:[buyer.address]});
 await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'acceptAdmin'});
 await assert.rejects(publicClient.simulateContract({account:signer,address:contract,abi:checkoutAbi,functionName:'setAllowedToken',args:[token,false]}),/Unauthorized/);
 await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'setAllowedToken',args:[token,true]});
 await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'transferAdmin',args:[signer.address]});
 await send({account:signer,address:contract,abi:checkoutAbi,functionName:'acceptAdmin'});
 assert.equal(await publicClient.readContract({address:contract,abi:checkoutAbi,functionName:'pendingAdmin'}),zeroAddress);
});

test('fees are rounded down and emitted with net proceeds',async()=>{
 const {decodeEventLog}=await import('viem');
 const before=await publicClient.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[signer.address]});
 const o=await order({amount:1000001n});
 const receipt=await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args});
 const event=decodeEventLog({abi:checkoutAbi,eventName:'PurchaseFeeCollected',data:receipt.logs[0].data,topics:receipt.logs[0].topics});
 assert.equal(event.args.feeAmount,5000n);
 assert.equal(event.args.sellerAmount,995001n);
 assert.equal(await publicClient.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[signer.address]}),before+5000n);
 const tiny=await order({amount:199n});
 const tinyReceipt=await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:tiny.args});
 assert.equal(decodeEventLog({abi:checkoutAbi,eventName:'PurchaseFeeCollected',data:tinyReceipt.logs[0].data,topics:tinyReceipt.logs[0].topics}).args.feeAmount,0n);
});
test('deferred fees reach treasury and emit publisher-bound six-decimal receipts',async()=>{
 const {decodeEventLog}=await import('viem');
 const id=keccak256(stringToHex('margit:seller:test'));
 const before=await publicClient.getBalance({address:signer.address});
 const result=await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'payDeferredFees',args:[id],value:5000n*10n**12n});
 const event=decodeEventLog({abi:checkoutAbi,eventName:'DeferredFeesPaid',data:result.logs[0].data,topics:result.logs[0].topics});
 assert.equal(event.args.sellerId,id);assert.equal(event.args.amount,5000n);
 assert.equal(await publicClient.getBalance({address:signer.address}),before+5000n*10n**12n);
 for(const value of [0n,1n])await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'payDeferredFees',args:[id],value}),/InvalidNativeValue/);
});

test('a failed treasury transfer rolls back seller payment and order consumption',async()=>{
 const o=await order();
 const before=await publicClient.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[seller.address]});
 await send({address:token,abi:tokenAbi,functionName:'setRejectAddress',args:[signer.address]});
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args}),/TransferFailed/);
 assert.equal(await publicClient.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[seller.address]}),before);
 assert.equal(await publicClient.readContract({address:contract,abi:checkoutAbi,functionName:'usedOrders',args:[o.value.orderId]}),false);
 await send({address:token,abi:tokenAbi,functionName:'setRejectAddress',args:[zeroAddress]});
 await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args});
});
