import { RevealText } from "./RevealText";

export function ListingCTA() {
  return (<>
    <div className="mxd-section padding-default">
      <div className="mxd-container">

        <div className="mxd-block">
          <div className="mxd-demo-cta">
            <div className="mxd-demo-cta__caption anim-uni-in-up">
              <h2 className="h2-small reveal-type"><RevealText text={"List your first repo and let agents find it."} /></h2>
            </div>
            <div className="mxd-demo-cta__btn anim-uni-in-up">
              <a className="btn btn-anim btn-default btn-large btn-additional slide-right" href="/api/auth/github/login">
                <span className="btn-caption">{"Connect with GitHub"}</span>
                <i className="ph-bold ph-github-logo"></i>
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  </>);
}
