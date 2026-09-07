# Fee model: decision pending

## Stellar Bazgit reference

Reviewed the local `stellar-bazgit-hack` implementation, especially `lib/store.ts` (fee calculations) and `app/api/fees/route.ts` (settlement).

It charges sellers 0.5% of earnings as a deferred debt. Buyers pay sellers in full. USDC debt above $0.10 (or XLM debt above 1 XLM) blocks new listings; existing listings keep selling. Sellers make a separate treasury payment to clear the debt.

This avoids changing the purchase payment, but collection depends on sellers returning to list again. Its JavaScript floating-point and currency rounding should not be carried into an onchain accounting implementation.

## Recommended Margit model

Deduct 0.5% (50 basis points) from the listed price within checkout. For a 1 USDC sale, the buyer pays 1 USDC, the seller receives 0.995 USDC and treasury receives 0.005 USDC. Native USDC still requires one transaction.

Before implementation, confirm automatic splitting versus deferred billing. Treasury destination and any admin-adjustable rate/cap must be explicit before deployment.

Implementation requirements if automatic splitting is selected:

- Use integer token units and document rounding; round the fee down and give the remainder to the seller.
- Bind the fee rate and recipient to the signed quote, so administrative changes cannot silently alter an outstanding quote's seller proceeds.
- Keep the existing purchase receipt amount as the gross buyer payment. Emit separate fee details for Graph, and show gross, fee and net in seller history.
- Fail the entire purchase if either payout fails; keep replay protection and the reentrancy guard.
- Disclose the deduction when listing. Do not add it on top of the price at checkout.
- Handle x402 separately: its current settlement bypasses this checkout contract. An automatic checkout fee must not be described as applying to every purchase until x402 collection is implemented.

No fee is enabled in the current live contract or this working revision.
