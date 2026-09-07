export function StarRating({ average, count }: { average: number; count: number }) {
    const rounded = Math.round(average);
    return (
        <span className="star-rating" title={count > 0 ? `${average.toFixed(1)} / 5 from ${count} review${count !== 1 ? "s" : ""}` : "No reviews yet"}>
            {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < rounded ? "star star-filled" : "star"}>
                    ★
                </span>
            ))}
            <span className="star-rating-count">{count > 0 ? `${average.toFixed(1)} (${count})` : "No reviews yet"}</span>
        </span>
    );
}
