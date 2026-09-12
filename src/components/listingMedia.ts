import type { CSSProperties } from 'react';

/** A contained screenshot on a flat background. */
export function listingMediaStyle(screenshot: string | undefined, fallback: string, background?: string | null): CSSProperties {
  return screenshot
    ? { '--listing-image': `url(${JSON.stringify(screenshot)})`, backgroundColor: background || '#000' } as CSSProperties
    : { backgroundColor: background || fallback };
}
