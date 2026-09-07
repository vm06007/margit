import fs from 'node:fs';
import {createPublicClient,createWalletClient,http,parseAbi,parseSignature,keccak256,stringToHex,decodeEventLog} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {arcTestnet,ARC_TOKEN_ADDRESSES} from '../server/src/payments.js';
import {checkoutAbi,checkoutDomain,orderTypes} from '../shared/checkout.js';
const metadata=JSON.parse(fs.readFileSync('contracts/deployment.arc-testnet.json','utf8'));
const account=privateKeyToAccount(process.env.ARC_SELLER_PRIVATE_KEY as `0x${string}`);
const signer=privateKeyToAccount(process.env.CHECKOUT_SIGNER_PRIVATE_KEY as `0x${string}`);
const client=createPublicClient({chain:arcTestnet,transport:http()});
const wallet=createWalletClient({account,chain:arcTestnet,transport:http()});
if(await client.getChainId()!==5042002)throw new Error('Wrong chain');
const reportPath=`contracts/smoke.arc-testnet.v${metadata.version}.json`;
if(fs.existsSync(reportPath)){console.log(fs.readFileSync(reportPath,'utf8'));process.exit(0);}
const order={orderId:keccak256(stringToHex(`margit-deployment-smoke:${metadata.address}`)),listingId:keccak256(stringToHex('margit-deployment-smoke-test')),termsHash:keccak256(stringToHex('Self-transfer test; no repository purchase or delivery')),buyer:account.address,seller:account.address,token:ARC_TOKEN_ADDRESSES.USDC as `0x${string}`,amount:10000n,deadline:BigInt(Math.floor(Date.now()/1000)+300)};
const signature=parseSignature(await signer.signTypedData({domain:checkoutDomain(metadata.address),types:orderTypes,primaryType:'Order',message:order}));

const gasPrice=await client.getGasPrice();
const maxFeePerGas=gasPrice*2n;
if(maxFeePerGas*300000n>1n*10n**18n)throw new Error('Smoke-test gas cap exceeded');
const hash=await wallet.writeContract({value:order.amount*10n**12n,address:metadata.address,abi:checkoutAbi,functionName:'buy',args:[order,Number(signature.v),signature.r,signature.s],gas:200000n,maxFeePerGas,maxPriorityFeePerGas:0n});
fs.writeFileSync(`contracts/smoke.v${metadata.version}.pending.local`,hash);
const receipt=await client.waitForTransactionReceipt({hash});
if(receipt.status!=='success')throw new Error('Smoke checkout failed');
const event=receipt.logs.find(log=>{try{return log.address.toLowerCase()===metadata.address.toLowerCase()&&decodeEventLog({abi:checkoutAbi,eventName:'PurchaseCompleted',topics:log.topics,data:log.data}).args.purchaseId===order.orderId}catch{return false}});
if(!event)throw new Error('Receipt missing');
const report={purpose:'Deployment smoke test: 0.01 USDC self-transfer, not a repository purchase',contract:metadata.address,transactionHash:hash,purchaseId:order.orderId,blockNumber:Number(receipt.blockNumber)};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
