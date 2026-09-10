export interface GraphActivity {
    available: boolean;
    message?: string;
    indexedBlock?: number;
    sales: { id: string; repository?: string; inCatalog?: boolean; listingId: string; buyer: string; seller: string; amount: string; currency: string; transactionHash: string; timestamp: string }[];
}
