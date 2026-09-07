import { StarRating } from "./StarRating";

/**
 * Placeholder — no backend yet. Reviews will be gated on a verified purchase
 * (a receipt issued on successful unlock, so both humans and agents can
 * review without needing a margit/GitHub account), rating + comment, with a
 * best-effort self-declared "agent" flag until something like ERC-8004
 * provides real verification.
 */
export function ReviewsSection({ subject }: { subject: string }) {
    return (
        <div className="reviews-section">
            <div className="reviews-header">
                <h3>Reviews</h3>
                <StarRating average={0} count={0} />
            </div>
            <p className="hint">No reviews yet for {subject}.</p>
            <div className="reviews-cta">
                <button type="button" className="btn btn-outline" disabled>
                    Leave a review
                </button>
                <span className="hint">Only buyers who've unlocked can review — not wired up yet.</span>
            </div>
        </div>
    );
}
