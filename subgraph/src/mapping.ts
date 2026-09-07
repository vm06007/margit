import { PurchaseCompleted, PurchaseFeeCollected, DeferredFeesPaid } from '../generated/MargitCheckout/MargitCheckout';
import { Purchase, PurchaseFee, DeferredFeePayment } from '../generated/schema';
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

export function handlePurchaseFeeCollected(event: PurchaseFeeCollected): void {
  const fee = new PurchaseFee(event.transaction.hash.concatI32(event.logIndex.toI32()));
  fee.purchaseId = event.params.purchaseId;
  fee.token = event.params.token;
  fee.treasury = event.params.treasury;
  fee.feeAmount = event.params.feeAmount;
  fee.sellerAmount = event.params.sellerAmount;
  fee.transactionHash = event.transaction.hash;
  fee.timestamp = event.block.timestamp;
  fee.save();
}
export function handleDeferredFeesPaid(event: DeferredFeesPaid): void {
  const payment = new DeferredFeePayment(event.transaction.hash.concatI32(event.logIndex.toI32()));
  payment.sellerId = event.params.sellerId;
  payment.payer = event.params.payer;
  payment.amount = event.params.amount;
  payment.transactionHash = event.transaction.hash;
  payment.timestamp = event.block.timestamp;
  payment.save();
}
