import { fallbackCardGradient } from "../lib/format";

export function CardMedia({ seed, screenshot, isNew }: { seed: string; screenshot?: string | null; isNew?: boolean }) {
    return (
        <div
            className="card-media"
            style={screenshot ? { backgroundImage: `url(${screenshot})` } : { background: fallbackCardGradient(seed) }}
        >
            {isNew && <span className="card-badge">🆕 New</span>}
        </div>
    );
}
