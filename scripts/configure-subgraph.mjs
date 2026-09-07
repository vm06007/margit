import fs from 'node:fs';
const deployment=JSON.parse(fs.readFileSync('contracts/deployment.arc-testnet.json','utf8'));
const network=process.env.GRAPH_NETWORK ?? 'arc-testnet';
if(!/^[a-z0-9-]+$/.test(network)||deployment.chainId!==5042002)throw new Error('Invalid Arc testnet configuration');
let template=fs.readFileSync('subgraph/subgraph.template.yaml','utf8');
for(const [key,value] of Object.entries({GRAPH_NETWORK:network,CHECKOUT_ADDRESS:deployment.address,START_BLOCK:deployment.startBlock}))template=template.replaceAll('${'+key+'}',String(value));
fs.writeFileSync('subgraph/subgraph.yaml',template);
console.log(`Configured ${network} at ${deployment.address}, block ${deployment.startBlock}`);
