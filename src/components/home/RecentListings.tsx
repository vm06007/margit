import type { Listing } from '../../api';
import { listingMediaStyle } from '../listingMedia';

export function RecentListings({ listings, error, onRetry, loading }: { onRetry: () => void; loading: boolean; listings: Listing[] | null; error: string | null }) {
  return <div className="row g-0">
    {error ? <div className="col-12 recent-listings-state"><p role="alert">{error}</p><button type="button" className="btn btn-default btn-small btn-outline" onClick={onRetry} disabled={loading}>{loading ? "Retrying…" : "Retry"}</button><span className="recent-listings-status" role="status">{loading ? "Loading listings…" : ""}</span></div> : !listings ? <div className="col-12 recent-listings-state" role="status"><p>Loading listings…</p></div> : !listings.length ?
      <div className="col-12"><p style={{ opacity: .6 }}>No listings yet — be the first to list a repo.</p></div> :
      listings.slice(0, 3).map((listing, i) => <div key={listing.id} className="col-12 col-xl-4 mxd-blog-preview__item mxd-grid-item animate-card-3">
        <a className="mxd-blog-preview__media" href={'/' + listing.repoFullName}>
          <div className="mxd-blog-preview__image listing-media" style={listingMediaStyle(listing.screenshots[0], i % 2 ? 'var(--additional)' : 'var(--accent)')} />
          <div className="mxd-preview-hover"><i className="mxd-preview-hover__icon"><img src="/site/img/icons/icon-eye.svg" alt="" /></i></div>
          <div className="mxd-blog-preview__tags"><span className="tag tag-default tag-permanent">{listing.language || 'Repo'}</span><span className="tag tag-default tag-permanent">{listing.price}</span></div>
        </a>
        <div className="mxd-blog-preview__data"><a href={'/' + listing.repoFullName}>{listing.repoFullName.split('/')[1]}</a></div>
      </div>)}
  </div>;
}
