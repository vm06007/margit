import { useEffect, useState } from "react";

/** Minimal client-side router — just two routes, no need for a routing library. */
export function useRoute(): [string, (path: string) => void] {
    const [path, setPath] = useState(window.location.pathname);

    useEffect(() => {
        const onPopState = () => setPath(window.location.pathname);
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    const navigate = (to: string) => {
        window.history.pushState({}, "", to);
        setPath(to);
    };

    return [path, navigate];
}
