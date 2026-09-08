import { useLayoutEffect, useRef } from "react";
import "../styles/page-loading.css";

export function PageLoading({ label }: { label: string }) {
    const container = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const element = container.current;
        if (!element) return;
        // Center below the page heading and controls, in the visible space left.
        const resize = () => {
            const viewport = window.visualViewport;
            const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
            const top = element.getBoundingClientRect().top;
            element.style.setProperty("--page-loading-height", `${Math.max(180, bottom - top)}px`);
        };
        resize();
        const observer = new ResizeObserver(resize);
        if (element.parentElement) observer.observe(element.parentElement);
        window.addEventListener("resize", resize);
        window.addEventListener("scroll", resize, true);
        window.visualViewport?.addEventListener("resize", resize);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", resize);
            window.removeEventListener("scroll", resize, true);
            window.visualViewport?.removeEventListener("resize", resize);
        };
    }, []);

    return <div ref={container} className="page-loading" role="status">
        <span className="page-loading-spinner" aria-hidden="true" />
        <p>{label}</p>
    </div>;
}
