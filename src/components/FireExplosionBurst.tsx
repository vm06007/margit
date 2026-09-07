import { useEffect, useRef } from "react";

const FIRE_COLORS = ["#ff3d00", "#ff6a00", "#ff9500", "#ffcc00", "#fff3c4", "#ffffff"];

type ConfettiPiece = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    rot: number;
    vr: number;
    color: string;
    circle: boolean;
};

function spawnBurst(width: number, height: number): ConfettiPiece[] {
    const originX = width / 2;
    const originY = height * 0.38;
    const pieces: ConfettiPiece[] = [];
    for (let i = 0; i < 180; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 6 + Math.random() * 12;
        pieces.push({
            x: originX,
            y: originY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 7,
            w: 6 + Math.random() * 8,
            h: 8 + Math.random() * 10,
            rot: Math.random() * Math.PI * 2,
            vr: (Math.random() - 0.5) * 0.42,
            color: FIRE_COLORS[i % FIRE_COLORS.length]!,
            circle: i % 5 === 0,
        });
    }
    return pieces;
}

export function FireExplosionBurst({ replay, className = "purchase-confetti" }: { replay: number; className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        
        const resize = () => {
            
            canvas.width = Math.max(1, Math.floor(window.innerWidth));
            canvas.height = Math.max(1, Math.floor(window.innerHeight));
        };
        resize();

        const pieces = spawnBurst(canvas.width, canvas.height);
        const started = performance.now();
        const duration = 2400;
        let frame = 0;

        const tick = (now: number) => {
            const elapsed = now - started;
            if (elapsed > duration) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const fade = elapsed > duration - 500 ? (duration - elapsed) / 500 : 1;
            ctx.globalAlpha = Math.max(0, fade);
            for (const piece of pieces) {
                piece.vy += 0.22;
                piece.vx *= 0.99;
                piece.x += piece.vx;
                piece.y += piece.vy;
                piece.rot += piece.vr;
                ctx.save();
                ctx.translate(piece.x, piece.y);
                ctx.rotate(piece.rot);
                ctx.fillStyle = piece.color;
                if (piece.circle) {
                    ctx.beginPath();
                    ctx.arc(0, 0, piece.w / 2, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
                }
                ctx.restore();
            }
            ctx.globalAlpha = 1;
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);

        const onResize = () => resize();
        window.addEventListener("resize", onResize);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", onResize);
        };
    }, [replay]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            aria-hidden
        />
    );
}

