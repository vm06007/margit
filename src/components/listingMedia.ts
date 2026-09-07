import type { CSSProperties } from 'react';

/** A contained screenshot on a flat background. */
export function listingMediaStyle(screenshot: string | undefined, fallback: string): CSSProperties {
  return screenshot
    ? { '--listing-image': `url(${JSON.stringify(screenshot)})`, backgroundColor: '#000' } as CSSProperties
    : { backgroundColor: fallback };
}
