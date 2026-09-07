import fs from 'node:fs';
import {spawn} from 'node:child_process';
if(!fs.existsSync('contracts/deployment.arc-testnet.json'))throw new Error('Deploy the Arc testnet checkout first');
const key=process.env.GRAPH_DEPLOY_KEY ?? fs.readFileSync('subgraph/deploy-key.local','utf8').trim();
const args=['deploy',process.env.GRAPH_SUBGRAPH_SLUG ?? 'margit-arc','subgraph/subgraph.yaml','--node','https://api.studio.thegraph.com/deploy/','--deploy-key',key,'--version-label',process.env.GRAPH_VERSION ?? 'v0.3.0','--output-dir','subgraph/build'];
const child=spawn('node_modules/.bin/graph',args,{stdio:['ignore','pipe','pipe']});
let output='';
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk.toString();});
child.on('close',code=>{const safe=output.split(key).join('[REDACTED]');fs.writeFileSync('subgraph/deploy-output.local',safe);process.stdout.write(safe);process.exitCode=code??1;});
