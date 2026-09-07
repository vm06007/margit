import { RevealText } from "./RevealText";

export function FeaturesPromo() {
  return (<>
    <div className="mxd-section">
      <div className="mxd-container no-padding-container">

        <div className="mxd-block">
          <div className="mxd-features-promo">
            <div className="container-fluid p-0">
              <div className="row g-0">

                <div className="col-12 col-xl-5 mxd-features-promo__item">
                  <div className="mxd-container grid-container no-padding-right">
                    <div className="mxd-block mxd-grid-item no-margin">
                      <div className="mxd-features-promo__content">
                        <h2 className="mxd-pinned__title centered-mobile h2-small anim-uni-in-up reveal-type"><RevealText text={"Top-notch features, build for you"} /></h2>
                        <div className="mxd-pinned__tags centered-mobile anim-uni-in-up">
                          <span className="tag tag-default tag-outline">{"Animations"}</span>
                          <span className="tag tag-default tag-outline">{"Plugins"}</span>
                          <span className="tag tag-default tag-outline">{"Services"}</span>
                        </div>
                        <p className="anim-uni-in-up centered-mobile">{"Real x402 payments on Arc testnet, an agent\n                            sidebar with its own funded wallet, and a Bazantic-ready API so any agent — not\n                            just ours — can browse, buy, and manage listings."}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-xl-7 mxd-features-promo__item">
                  <div className="mxd-features-promo__image anim-uni-in-up">
                    <img src="/site/img/demo/01_fea-img.webp" alt="Margit Image" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </>);
}
