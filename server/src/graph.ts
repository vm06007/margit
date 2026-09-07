import type { Purchase } from '../../shared/purchase.js';
/** Optional indexer enrichment. Never use Graph availability as a delivery authorization gate. */
export async function indexedPurchases(purchases:Purchase[]):Promise<{configured:boolean;available:boolean;ids:string[]}> {
    const endpoint=process.env.GRAPH_QUERY_URL;
    if(!endpoint)return {configured:false,available:false,ids:[]};
    const receipts=purchases.filter(p=>p.checkoutContract&&p.onchainPurchaseId);
    if(!receipts.length)return {configured:true,available:true,ids:[]};
    try {
        const ids:string[]=[];
        for(let i=0;i<receipts.length;i+=100){
            const chunk=receipts.slice(i,i+100);
            const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.GRAPH_QUERY_API_KEY?{Authorization:`Bearer ${process.env.GRAPH_QUERY_API_KEY}`}:{})},body:JSON.stringify({query:'query Receipts($ids: [Bytes!]!) { purchases(first: 100, where: {purchaseId_in: $ids}) { purchaseId transactionHash } }',variables:{ids:chunk.map(p=>p.onchainPurchaseId)}}),signal:AbortSignal.timeout(4000)});
            if(!response.ok)throw new Error('Indexer unavailable');
            const result=await response.json() as {errors?:unknown;data?:{purchases:{purchaseId:string;transactionHash:string}[]}};
            if(result.errors||!result.data)throw new Error('Indexer query failed');
            for(const receipt of chunk)if(result.data.purchases.some(p=>p.purchaseId.toLowerCase()===receipt.onchainPurchaseId!.toLowerCase()&&p.transactionHash.toLowerCase()===receipt.transactionHash?.toLowerCase()))ids.push(receipt.id);
        }
        return {configured:true,available:true,ids};
    }catch{return {configured:true,available:false,ids:[]};}
}
