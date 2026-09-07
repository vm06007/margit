import { useEffect, useRef, useState } from "react";

type Visibility = "private" | "public";
export function RepoVisibilitySelect({ value, onChange }: { value: Visibility; onChange: (value: Visibility) => void }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    return <div className="repo-visibility-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <button ref={trigger} type="button" className="pill-select repo-visibility-trigger" aria-haspopup="menu" aria-expanded={open}
            onClick={() => setOpen(!open)} onKeyDown={event => {if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {event.preventDefault(); setOpen(true)}}}>
            <span>{value === 'private' ? 'Private' : 'Public'}<span className="repo-visibility-suffix"> repos</span></span><i className="ph ph-caret-down" aria-hidden="true" />
        </button>
        {open && <div ref={menu} className="profile-menu repo-visibility-menu" role="menu" aria-label="Repository visibility" onKeyDown={event => {
            if (event.key === 'Escape') {event.preventDefault(); setOpen(false); trigger.current?.focus()}
            if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
                event.preventDefault();
                const options = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button'));
                const index = options.indexOf(document.activeElement as HTMLButtonElement);
                options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length]?.focus();
            }
        }}>
            {(['private','public'] as const).map(option => <button key={option} type="button" role="menuitemradio" aria-checked={value === option} className="profile-menu-item" onClick={() => {onChange(option); setOpen(false); trigger.current?.focus()}}>
                <i className={`ph ph-${option === 'private' ? 'lock-simple' : 'globe'}`} aria-hidden="true" />
                <span>{option === 'private' ? 'Private' : 'Public'}<span className="repo-visibility-suffix"> repos</span></span>
                {value === option && <i className="ph ph-check repo-visibility-check" aria-hidden="true" />}
            </button>)}
        </div>}
    </div>;
}
