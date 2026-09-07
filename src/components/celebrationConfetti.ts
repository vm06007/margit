import type confetti from "canvas-confetti";

export function fireCelebrationBurst(fire: ReturnType<typeof confetti.create>) {
        const base = { colors: ["#ff3d00", "#ff6a00", "#ff9500", "#ffcc00", "#fff3c4", "#ffffff"], disableForReducedMotion: true };
        void fire({ ...base, origin: { x: .5, y: .42 }, particleCount: 180, spread: 360, startVelocity: 52, ticks: 240, gravity: .85, scalar: 1.05 });
        void fire({ ...base, origin: { x: .5, y: .42 }, particleCount: 90, spread: 360, startVelocity: 28, decay: .9, scalar: 1.45 });
        void fire({ ...base, origin: { x: .18, y: .62 }, angle: 60, spread: 75, particleCount: 80, startVelocity: 58 });
        void fire({ ...base, origin: { x: .82, y: .62 }, angle: 120, spread: 75, particleCount: 80, startVelocity: 58 });
}
