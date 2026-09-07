import { Children, cloneElement, isValidElement, type ReactNode } from 'react';

/** Two identical sequences let the CSS loop without an empty gap or a jump. */
export function MarqueeTrack({ children, className }: { children: ReactNode; className: string }) {
  return <div className={className}>
    {children}
    {Children.map(children, child => isValidElement<Record<string, unknown>>(child)
      ? cloneElement(child, { 'aria-hidden': true })
      : child)}
  </div>;
}
