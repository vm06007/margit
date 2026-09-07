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
const tokenAbi = parseAbi(['function approve(address,uint256) returns(bool)','function balanceOf(address) view returns(uint256)','function setFail(bool)','function setCallback(address,bytes)']);
let token:`0x${string}`, contract:`0x${string}`, otherContract:`0x${string}`;
const mock = `pragma solidity ^0.8.24;
contract Token {
 mapping(address=>uint) public balanceOf; mapping(address=>mapping(address=>uint)) public allowance;
 bool public fail; address target; bytes payload;
 constructor(address buyer){balanceOf[buyer]=1000000000;}
 function approve(address to,uint amount) external returns(bool){allowance[msg.sender][to]=amount;return true;}
 function setFail(bool value) external {fail=value;}
 function setCallback(address to,bytes calldata data) external {target=to;payload=data;}
 function transferFrom(address from,address to,uint amount) external returns(bool){
 if(fail)return false;
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
 for(let i=0;i<2;i++){const hash=await wallet.deployContract({abi,bytecode,args:[token,token,signer.address]});const address=(await publicClient.waitForTransactionReceipt({hash})).contractAddress!;if(i===0)contract=address;else otherContract=address;}
 await send({account:buyer,address:token,abi:tokenAbi,functionName:'approve',args:[contract,1000000000n]});
});
test('payment goes to seller; receipt is emitted; order cannot be reused',async()=>{
 const o=await order();const before=await publicClient.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[seller.address]});
 const result=await send({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args});
 assert.equal(result.logs.filter(log=>log.address.toLowerCase()===contract.toLowerCase()).length,1);
 assert.equal(await publicClient.readContract({address:token,abi:tokenAbi,functionName:'balanceOf',args:[seller.address]}),before+o.value.amount);
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args}),/Order used/);
});
test('rejects another buyer, changed price, expired quote, unsupported token and cross-domain signatures',async()=>{
 const o=await order();
 for(const [account,address,args,pattern] of [
  [other,contract,o.args,/Wrong buyer/],
  [buyer,contract,[{...o.value,amount:2000000n},...o.args.slice(1)],/Invalid signer/],
  [buyer,otherContract,o.args,/Invalid signer/],
  [buyer,contract,(await order({deadline:0n})).args,/Order expired/],
  [buyer,contract,(await order({token:zeroAddress})).args,/Invalid order/],
  [buyer,contract,(await order({},contract,5042002)).args,/Invalid signer/],
 ] as any[]) await assert.rejects(publicClient.simulateContract({account,address,abi:checkoutAbi,functionName:'buy',args}),pattern);
});
test('failed transfer leaves order unused and can be retried',async()=>{
 const o=await order();await send({address:token,abi:tokenAbi,functionName:'setFail',args:[true]});
 await assert.rejects(publicClient.simulateContract({account:buyer,address:contract,abi:checkoutAbi,functionName:'buy',args:o.args}),/Transfer failed/);
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
