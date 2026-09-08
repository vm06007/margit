export interface AgentPaymentProof {
    provider: 'Circle Gateway';
    sdk: '@circle-fin/x402-batching';
    network: 'Arc testnet';
    chainId: 5042002;
    protocol: 'x402';
    walletType: 'Demo EOA' | 'Personal EOA';
    buyer: string;
    seller: string;
    amountUsdc: string;
    paymentId: string;
    transactionHash?: string;
    settlementReference?: string;
    status: 'accepted';
    recordedAt: string;
}

