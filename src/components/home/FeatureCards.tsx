
export function FeatureCards() {
  return (<>
    <div className="mxd-section overflow-hidden" id="x402" aria-label="How x402 payments work">
      <div className="mxd-container grid-container">

        <div className="mxd-block">
          <div className="mxd-features-cards">
            <div className="container-fluid px-0">
              <div className="row gx-0">

                <div className="col-12 col-xl-4 mxd-features-cards__item mxd-grid-item anim-uni-scale-in-right">
                  <div className="mxd-features-cards__inner bg-additional radius-l padding-4">
                    <div className="mxd-features-cards__title">
                      <h3 className="anim-uni-in-up">{"1. Request access"}</h3>
                    </div>
                    <div className="mxd-features-cards__info">
                      <div className="mxd-features-cards__tags">
                        <span className="tag tag-default tag-outline anim-uni-in-up">{"x402"}</span>
                        <span className="tag tag-default tag-outline anim-uni-in-up">{"HTTP 402"}</span>
                        <span className="tag tag-default tag-outline anim-uni-in-up">{"Discover"}</span>
                      </div>
                      <p className="t-bright anim-uni-in-up">{"Choose an x402-enabled repository. Request access to receive its price and payment requirements."}</p>
                    </div>
                    <div className="mxd-features-cards__image features-image-03">
                      <img src="/site/img/demo/04_fea-img.webp" alt="" />
                    </div>
                  </div>
                </div>

                <div className="col-12 col-xl-4 mxd-features-cards__item mxd-grid-item anim-uni-scale-in">
                  <div className="mxd-features-cards__inner bg-base-opp radius-l padding-4">
                    <div className="mxd-features-cards__title">
                      <h3 className="opposite anim-uni-in-up">{"2. Pay with USDC"}</h3>
                    </div>
                    <div className="mxd-features-cards__info">
                      <div className="mxd-features-cards__tags">
                        <span className="tag tag-default tag-outline-opposite anim-uni-in-up">{"USDC"}</span>
                        <span className="tag tag-default tag-outline-opposite anim-uni-in-up">{"Arc testnet"}</span>
                        <span className="tag tag-default tag-outline-opposite anim-uni-in-up">{"Gateway"}</span>
                      </div>
                      <p className="t-opposite anim-uni-in-up">{"Fund Circle Gateway with testnet USDC. Your x402 client signs the payment and retries the request."}</p>
                    </div>
                    <div className="mxd-features-cards__image features-image-04">
                      <img src="/site/img/demo/06_fea-img.webp" alt="" />
                    </div>
                  </div>
                </div>

                <div className="col-12 col-xl-4 mxd-features-cards__item mxd-grid-item anim-uni-scale-in-left">
                  <div className="mxd-features-cards__inner justify-end bg-base-tint radius-l padding-4">
                    <div className="mxd-features-cards__gradient features-gradient-02">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">
                        <style type="text/css">{"\n                            .mxd-card-bg{fill:url(#purple-radial-gradient);}\n                          "}</style>
                        <g>
                          <radialGradient id="purple-radial-gradient" cx="600" cy="600" r="600" gradientUnits="userSpaceOnUse">
                            <stop offset="0" style={{ "stopColor": "#9F8BE7", "stopOpacity": "0.6" }}></stop>
                            <stop offset="1" style={{ "stopColor": "#9F8BE7", "stopOpacity": "0" }}></stop>
                          </radialGradient>
                          <circle className="mxd-card-bg" cx="600" cy="600" r="600"></circle>
                        </g>
                      </svg>
                    </div>
                    <div className="mxd-features-cards__title">
                      <h3 className="anim-uni-in-up">{"3. Unlock"}<br />{"the repo"}</h3>
                    </div>
                    <div className="mxd-features-cards__info">
                      <div className="mxd-features-cards__tags">
                        <span className="tag tag-default tag-outline anim-uni-in-up">{"Access"}</span>
                        <span className="tag tag-default tag-outline anim-uni-in-up">{"Clone"}</span>
                        <span className="tag tag-default tag-outline anim-uni-in-up">{"Build"}</span>
                      </div>
                      <p className="anim-uni-in-up">{"After payment settles, receive repository access with the seller’s chosen delivery terms. Your agent can get to work."}</p>
                    </div>
                    <div className="mxd-features-cards__image features-image-05">
                      <img src="/site/img/demo/05_fea-img.webp" alt="" />
                    </div>
                  </div>
                </div>

                <div className="col-12 mxd-features-cards__teaser mxd-grid-item anim-uni-in-up">
                  <p className="mxd-point-subtitle anim-uni-in-up">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20px" height="20px" viewBox="0 0 20 20" fill="currentColor">
                      <path fill="currentColor" d="M19.6,9.6c0,0-3,0-4,0c-0.4,0-1.8-0.2-1.8-0.2c-0.6-0.1-1.1-0.2-1.6-0.6c-0.5-0.3-0.9-0.8-1.2-1.2                           c-0.3-0.4-0.4-0.9-0.5-1.4c0,0-0.1-1.1-0.2-1.5c-0.1-1.1,0-4.4,0-4.4C10.4,0.2,10.2,0,10,0S9.6,0.2,9.6,0.4c0,0,0.1,3.3,0,4.4                           c0,0.4-0.2,1.5-0.2,1.5C9.4,6.7,9.2,7.2,9,7.6C8.7,8.1,8.2,8.5,7.8,8.9c-0.5,0.3-1,0.5-1.6,0.6c0,0-1.2,0.1-1.7,0.2                           c-1,0.1-4.2,0-4.2,0C0.2,9.6,0,9.8,0,10c0,0.2,0.2,0.4,0.4,0.4c0,0,3.1-0.1,4.2,0c0.4,0,1.7,0.2,1.7,0.2c0.6,0.1,1.1,0.2,1.6,0.6                           c0.4,0.3,0.8,0.7,1.1,1.1c0.3,0.5,0.5,1,0.6,1.6c0,0,0.1,1.3,0.2,1.7c0,1,0,4.1,0,4.1c0,0.2,0.2,0.4,0.4,0.4s0.4-0.2,0.4-0.4                           c0,0,0-3.1,0-4.1c0-0.4,0.2-1.7,0.2-1.7c0.1-0.6,0.2-1.1,0.6-1.6c0.3-0.4,0.7-0.8,1.1-1.1c0.5-0.3,1-0.5,1.6-0.6                           c0,0,1.3-0.1,1.8-0.2c1,0,4,0,4,0c0.2,0,0.4-0.2,0.4-0.4C20,9.8,19.8,9.6,19.6,9.6L19.6,9.6z"></path>
                    </svg>
                    <span>{"x402 payments · USDC on Arc testnet"}</span>
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20px" height="20px" viewBox="0 0 20 20" fill="currentColor">
                      <path fill="currentColor" d="M19.6,9.6c0,0-3,0-4,0c-0.4,0-1.8-0.2-1.8-0.2c-0.6-0.1-1.1-0.2-1.6-0.6c-0.5-0.3-0.9-0.8-1.2-1.2                           c-0.3-0.4-0.4-0.9-0.5-1.4c0,0-0.1-1.1-0.2-1.5c-0.1-1.1,0-4.4,0-4.4C10.4,0.2,10.2,0,10,0S9.6,0.2,9.6,0.4c0,0,0.1,3.3,0,4.4                           c0,0.4-0.2,1.5-0.2,1.5C9.4,6.7,9.2,7.2,9,7.6C8.7,8.1,8.2,8.5,7.8,8.9c-0.5,0.3-1,0.5-1.6,0.6c0,0-1.2,0.1-1.7,0.2                           c-1,0.1-4.2,0-4.2,0C0.2,9.6,0,9.8,0,10c0,0.2,0.2,0.4,0.4,0.4c0,0,3.1-0.1,4.2,0c0.4,0,1.7,0.2,1.7,0.2c0.6,0.1,1.1,0.2,1.6,0.6                           c0.4,0.3,0.8,0.7,1.1,1.1c0.3,0.5,0.5,1,0.6,1.6c0,0,0.1,1.3,0.2,1.7c0,1,0,4.1,0,4.1c0,0.2,0.2,0.4,0.4,0.4s0.4-0.2,0.4-0.4                           c0,0,0-3.1,0-4.1c0-0.4,0.2-1.7,0.2-1.7c0.1-0.6,0.2-1.1,0.6-1.6c0.3-0.4,0.7-0.8,1.1-1.1c0.5-0.3,1-0.5,1.6-0.6                           c0,0,1.3-0.1,1.8-0.2c1,0,4,0,4,0c0.2,0,0.4-0.2,0.4-0.4C20,9.8,19.8,9.6,19.6,9.6L19.6,9.6z"></path>
                    </svg>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </>);
}
