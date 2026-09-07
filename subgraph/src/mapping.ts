import { PurchaseCompleted } from '../generated/MargitCheckout/MargitCheckout';
import { Purchase } from '../generated/schema';
export function handlePurchaseCompleted(event: PurchaseCompleted): void {
  const purchase = new Purchase(event.transaction.hash.concatI32(event.logIndex.toI32()));
  purchase.purchaseId = event.params.purchaseId;
  purchase.listingId = event.params.listingId;
  purchase.buyer = event.params.buyer;
  purchase.seller = event.params.seller;
  purchase.token = event.params.token;
  purchase.amount = event.params.amount;
  purchase.termsHash = event.params.termsHash;
  purchase.transactionHash = event.transaction.hash;
  purchase.timestamp = event.block.timestamp;
  purchase.save();
}
