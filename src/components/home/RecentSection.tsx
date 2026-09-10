import { RevealText } from "./RevealText";
import type { Listing } from "../../api";
import { RecentListings } from "./RecentListings";
export function RecentSection({ listings, listingsError }: { listings: Listing[] | null; listingsError: string | null }) {
  return (<>
    <div className="mxd-section padding-blog recent-listings-section" style={{ marginTop: 150 }}>
      <div className="mxd-container grid-container">
        <div className="mxd-block">
          <div className="mxd-section-title pre-grid">
            <div className="container-fluid p-0">
              <div className="row g-0">
                <div className="col-12 col-xl-9 mxd-grid-item no-margin">
                  <div className="mxd-section-title__hrtitle">
                    <h2 className="reveal-type anim-uni-in-up"><RevealText text={"Recent listings"} /></h2>
                  </div>
                </div>
                <div className="col-12 col-xl-3 mxd-grid-item no-margin">
                  <div className="mxd-section-title__hrcontrols anim-uni-in-up">
                    <a className="btn btn-anim btn-default btn-outline slide-right-up" href="/catalog">
                      <span className="btn-caption">{"Browse Catalog"}</span>
                      <i className="ph-bold ph-arrow-up-right"></i>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mxd-block">
          <div className="mxd-blog-preview">
            <div className="container-fluid p-0">
              <RecentListings listings={listings} error={listingsError} />
            </div>
          </div>
        </div>
      </div>
    </div>
  </>);
}
