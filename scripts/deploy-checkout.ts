import fs from 'node:fs';
import { createPublicClient, createWalletClient, http, formatEther, parseAbi } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, ARC_TOKEN_ADDRESSES } from '../server/src/payments.js';
import { checkoutAbi } from '../shared/checkout.js';
const key = process.env.ARC_SELLER_PRIVATE_KEY;
if (!key || !/^0x[0-9a-f]{64}$/i.test(key)) throw new Error('Configure ARC_SELLER_PRIVATE_KEY locally');
const account = privateKeyToAccount(key as `0x${string}`);
const client = createPublicClient({chain:arcTestnet,transport:http()});
const wallet = createWalletClient({account,chain:arcTestnet,transport:http()});
if(await client.getChainId()!==5042002)throw new Error('Wrong chain');
const metadataPath='contracts/deployment.arc-testnet.json';
const pendingPath='contracts/deployment.pending.local';
function setEnv(name:string,value:string){
 let env=fs.readFileSync('.env','utf8');const line=`${name}=${value}`;const pattern=new RegExp(`^${name}=.*$`,'m');
 env=pattern.test(env)?env.replace(pattern,line):`${env.trimEnd()}\n${line}\n`;
 fs.writeFileSync('.env',env,{mode:0o600});
}
let signerKey=process.env.CHECKOUT_SIGNER_PRIVATE_KEY as `0x${string}`|undefined;
if(!signerKey){signerKey=generatePrivateKey();setEnv('CHECKOUT_SIGNER_PRIVATE_KEY',signerKey);}
const signer=privateKeyToAccount(signerKey);
for(const token of Object.values(ARC_TOKEN_ADDRESSES)){
 const decimals=await client.readContract({address:token as `0x${string}`,abi:parseAbi(['function decimals() view returns (uint8)']),functionName:'decimals'});
 if(decimals!==6)throw new Error('Unexpected token decimals');
}
const balance=await client.getBalance({address:account.address});
console.log(JSON.stringify({chainId:arcTestnet.id,deployer:account.address,quoteSigner:signer.address,balanceUSDC:formatEther(balance)}));
if(fs.existsSync(metadataPath)){
 const deployment=JSON.parse(fs.readFileSync(metadataPath,'utf8'));
 const configured=await client.readContract({address:deployment.address,abi:checkoutAbi,functionName:'quoteSigner'});
 if(configured.toLowerCase()!==signer.address.toLowerCase())throw new Error('Existing deployment signer mismatch');
 setEnv('CHECKOUT_CONTRACT_ADDRESS',deployment.address);
 console.log('Existing deployment verified',deployment.address);process.exit(0);
}
if(balance===0n){console.log('Deployment needs test USDC for gas. No transaction sent.');process.exit(2);}
const abi=JSON.parse(fs.readFileSync('contracts/artifacts/MargitCheckout.abi.json','utf8'));
const bytecode=`0x${fs.readFileSync('contracts/artifacts/MargitCheckout.bytecode.txt','utf8').trim()}` as `0x${string}`;
const args=[ARC_TOKEN_ADDRESSES.USDC,ARC_TOKEN_ADDRESSES.EURC,signer.address];
const {encodeDeployData}=await import('viem');
const gas=await client.estimateGas({account,data:encodeDeployData({abi,bytecode,args})});
const gasPrice=await client.getGasPrice();
const maxFeePerGas=gasPrice*2n;const gasLimit=gas*12n/10n;
console.log('Maximum deployment fee USDC',formatEther(gasLimit*maxFeePerGas));
if(gasLimit*maxFeePerGas>5n*10n**18n || balance<gasLimit*maxFeePerGas)throw new Error('Deployment fee exceeds 5 USDC cap or available balance');
if(!process.argv.includes('--deploy'))process.exit(0);
let hash:`0x${string}`;
if(fs.existsSync(pendingPath))hash=fs.readFileSync(pendingPath,'utf8').trim() as `0x${string}`;
else {hash=await wallet.deployContract({abi,bytecode,args,gas:gasLimit,maxFeePerGas,maxPriorityFeePerGas:0n});fs.writeFileSync(pendingPath,hash);}
const receipt=await client.waitForTransactionReceipt({hash});
if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('Deployment failed');
const address=receipt.contractAddress;
const deployedSigner=await client.readContract({address,abi:checkoutAbi,functionName:'quoteSigner'});
if(deployedSigner.toLowerCase()!==signer.address.toLowerCase())throw new Error('Deployed signer mismatch');
const metadata={chainId:arcTestnet.id,address,transactionHash:hash,startBlock:Number(receipt.blockNumber),deployer:account.address,quoteSigner:signer.address,tokens:ARC_TOKEN_ADDRESSES};
fs.writeFileSync(metadataPath,JSON.stringify(metadata,null,2)+'\n');
setEnv('CHECKOUT_CONTRACT_ADDRESS',address);
console.log(JSON.stringify(metadata));
