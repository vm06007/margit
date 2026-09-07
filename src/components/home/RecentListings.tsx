import type { Listing } from '../../api';

export function RecentListings({ listings, error }: { listings: Listing[] | null; error: string | null }) {
  return <div className="row g-0">
    {error ? <p role="alert">{error}</p> : !listings ? <p>Loading listings…</p> : !listings.length ?
      <div className="col-12"><p style={{ opacity: .6 }}>No listings yet — be the first to list a repo.</p></div> :
      listings.slice(0, 3).map((listing, i) => <div key={listing.id} className="col-12 col-xl-4 mxd-blog-preview__item mxd-grid-item animate-card-3">
        <a className="mxd-blog-preview__media" href={'/' + listing.repoFullName}>
          <div className="mxd-blog-preview__image" style={listing.screenshots[0] ? { backgroundImage: `url(${listing.screenshots[0]})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: i % 2 ? 'var(--additional)' : 'var(--accent)' }} />
          <div className="mxd-preview-hover"><i className="mxd-preview-hover__icon"><img src="/site/img/icons/icon-eye.svg" alt="" /></i></div>
          <div className="mxd-blog-preview__tags"><span className="tag tag-default tag-permanent">{listing.language || 'Repo'}</span><span className="tag tag-default tag-permanent">{listing.price}</span></div>
        </a>
        <div className="mxd-blog-preview__data"><a href={'/' + listing.repoFullName}>{listing.repoFullName.split('/')[1]}</a></div>
      </div>)}
  </div>;
}
