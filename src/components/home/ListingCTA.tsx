import { GithubConnectButton } from "../GithubConnectButton";
import { RevealText } from "./RevealText";

export function ListingCTA() {
  return (<>
    <div className="mxd-section padding-default home-listing-cta">
      <div className="mxd-container">

        <div className="mxd-block">
          <div className="mxd-demo-cta">
            <div className="mxd-demo-cta__caption anim-uni-in-up">
              <h2 className="h2-small reveal-type"><RevealText text={"List your first repo and let agents find it."} /></h2>
            </div>
            <div className="mxd-demo-cta__btn anim-uni-in-up">
              <GithubConnectButton className="btn btn-anim btn-default btn-large btn-additional slide-right" label="Connect with GitHub" />
            </div>
          </div>
        </div>

      </div>
    </div>
  </>);
}
