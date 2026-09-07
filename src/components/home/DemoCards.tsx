
export function DemoCards() {
  return (<>
    <div className="mxd-section">
      <div className="mxd-container">

        <div className="mxd-block">
          <div className="mxd-demo-cards">

            <div className="mxd-demo-cards__item card-item-left animate-card-2">
              <div className="mxd-demo-cards__content">
                <div className="mxd-demo-cards__descr">
                  <h2 className="mxd-demo-cards__title h2-small">
                    <a href="blog-standard.html" target="_blank">{"Blog Pages"}</a>
                  </h2>
                  <div className="mxd-demo-cards__tags">
                    <span className="tag tag-default tag-outline">{"Ideas"}</span>
                    <span className="tag tag-default tag-outline">{"Thoughts"}</span>
                    <span className="tag tag-default tag-outline">{"Inspiration"}</span>
                  </div>
                  <p>{"A blog that looks good, reads better, and brings your stories to life beautifully."}</p>
                </div>
              </div>
              <div className="mxd-demo-cards__image card-image-fullwidth">
                <img src="/site/img/demo/02_card-img.webp" alt="Demo Card Image" />
              </div>
            </div>

            <div className="mxd-demo-cards__item card-item-right animate-card-2">
              <div className="mxd-demo-card__gradient">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200">
                  <style type="text/css">{"\n                      .mxd-card-bg{fill:url(#purple-radial-gr);}\n                    "}</style>
                  <g>
                    <radialGradient id="purple-radial-gr" cx="600" cy="600" r="600" gradientUnits="userSpaceOnUse">
                      <stop offset="0" style={{ "stopColor": "#9F8BE7", "stopOpacity": "0.6" }}></stop>
                      <stop offset="1" style={{ "stopColor": "#9F8BE7", "stopOpacity": "0" }}></stop>
                    </radialGradient>
                    <circle className="mxd-card-bg" cx="600" cy="600" r="600"></circle>
                  </g>
                </svg>
              </div>
              <div className="mxd-demo-cards__image card-image-padding">
                <img src="/site/img/demo/01_card-img.webp" alt="Demo Card Image" />
              </div>
              <div className="mxd-demo-cards__content">
                <div className="mxd-demo-cards__descr">
                  <h2 className="mxd-demo-cards__title h2-small">
                    <a href="/works" target="_blank">{"Portfolio"}</a>
                  </h2>
                  <div className="mxd-demo-cards__tags">
                    <span className="tag tag-default tag-outline">{"Showcase"}</span>
                    <span className="tag tag-default tag-outline">{"Visions"}</span>
                    <span className="tag tag-default tag-outline">{"Designs"}</span>
                  </div>
                  <p>{"Bring your work to life with stunning layouts. Clear, stylish pages built to impress \n                      and inspire."}</p>
                </div>
                <div className="mxd-demo-cards__icons">
                  <div className="demo-icons__item">
                    <div className="demo-icons__icon">
                      <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 56 56">
                        <path d="M54.8,28c0,10.6-2.8,26.8-26.8,26.8S1.2,38.6,1.2,28,4,1.2,28,1.2s26.8,16.2,26.8,26.8Z"></path>
                      </svg>
                      <i className="ph ph-cards-three"></i>
                    </div>
                    <p className="demo-icons__caption">{"Stack cards"}</p>
                  </div>
                  <div className="demo-icons__item">
                    <div className="demo-icons__icon">
                      <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 56 56">
                        <path d="M54.8,28c0,10.6-2.8,26.8-26.8,26.8S1.2,38.6,1.2,28,4,1.2,28,1.2s26.8,16.2,26.8,26.8Z"></path>
                      </svg>
                      <i className="ph ph-squares-four"></i>
                    </div>
                    <p className="demo-icons__caption">{"Grids"}</p>
                  </div>
                  <div className="demo-icons__item">
                    <div className="demo-icons__icon">
                      <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 56 56">
                        <path d="M54.8,28c0,10.6-2.8,26.8-26.8,26.8S1.2,38.6,1.2,28,4,1.2,28,1.2s26.8,16.2,26.8,26.8Z"></path>
                      </svg>
                      <i className="ph ph-list-star"></i>
                    </div>
                    <p className="demo-icons__caption">{"Archive list"}</p>
                  </div>
                  <div className="demo-icons__item">
                    <div className="demo-icons__icon">
                      <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 56 56">
                        <path d="M54.8,28c0,10.6-2.8,26.8-26.8,26.8S1.2,38.6,1.2,28,4,1.2,28,1.2s26.8,16.2,26.8,26.8Z"></path>
                      </svg>
                      <i className="ph ph-chat-circle-dots"></i>
                    </div>
                    <p className="demo-icons__caption">{"Testimonials"}</p>
                  </div>
                  <div className="demo-icons__item">
                    <div className="demo-icons__icon">
                      <svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 56 56">
                        <path d="M54.8,28c0,10.6-2.8,26.8-26.8,26.8S1.2,38.6,1.2,28,4,1.2,28,1.2s26.8,16.2,26.8,26.8Z"></path>
                      </svg>
                      <i className="ph ph-cherries"></i>
                    </div>
                    <p className="demo-icons__caption">{"Project"}</p>
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
