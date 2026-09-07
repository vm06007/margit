import { Logo } from "./Logo";

export function HomeFooter() {
  return (<>
    <footer className="mxd-demo-footer">

      <div className="mxd-demo-footer__bg">
        <img src="/site/img/demo/01-footer.webp" alt="Margit Image" />
      </div>


      <div className="mxd-container grid-container">

        <div className="mxd-block">
          <div className="container-fluid p-0">
            <div className="row g-0">
              <div className="col-12 col-xl-3 mxd-demo-footer__item mxd-grid-item">
                <div className="mxd-demo-footer__logo anim-uni-in-up">
                  <a href="#0" className="mxd-logo">

                    <Logo />

                    <span className="mxd-logo__text" style={{ "fontSize": "4rem" }}>{"Margit"}</span>
                  </a>
                </div>
                <div className="mxd-demo-footer__slogan anim-uni-in-up">
                  <p className="t-small t-bright">{"👋 Built for ETHGlobal ETHOnline 2026 — sell repos to humans or AI agents, paid in USDC/EURC on Arc Blockchain."}</p>
                </div>
                <div className="mxd-demo-footer__btn anim-uni-in-up">
                  <a className="btn btn-anim btn-default btn-small btn-accent slide-right" href="/catalog">
                    <span className="btn-caption">{"Catalog"}</span>
                    <i className="ph ph-shopping-cart-simple"></i>
                  </a>
                  <a className="btn btn-anim btn-default btn-small btn-outline slide-right-up" href="/works">
                    <span className="btn-caption">{"My Repos"}</span>
                    <i className="ph ph-arrow-up-right"></i>
                  </a>
                </div>
              </div>
              <div className="col-12 col-xl-9 mxd-demo-footer__item">
                <nav className="mxd-demo-footer__nav">
                  <div className="container-fluid p-0">
                    <div className="row g-0">
                      <div className="col-12 col-md-4 mxd-grid-item mxd-footer-nav__item">
                        <div className="mxd-footer-nav__block">
                          <div className="mxd-footer-nav__title anim-uni-in-up">
                            <p className="t-140 t-bright t-caption">{"Marketplace"}</p>
                          </div>
                          <div className="mxd-footer-nav__list">
                            <ul>
                              <li><a className="anim-uni-in-up" href="/">{"Home"}</a></li>
                              <li><a className="anim-uni-in-up" href="/catalog">{"Catalog"}</a></li>
                              <li><a className="anim-uni-in-up" href="/works">{"My Repos"}</a></li>
                            </ul>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-md-4 mxd-grid-item mxd-footer-nav__item">
                        <div className="mxd-footer-nav__block">
                          <div className="mxd-footer-nav__title anim-uni-in-up">
                            <p className="t-140 t-bright t-caption">{"For Agents"}</p>
                          </div>
                          <div className="mxd-footer-nav__list">
                            <ul>
                              <li><a className="anim-uni-in-up" href="/api/auth/github/login">{"Connect GitHub"}</a></li>
                              <li><a className="anim-uni-in-up" href="https://github.com/vm06007/margit" target="_blank" rel="noreferrer">{"GitHub Source"}</a></li>
                              <li><a className="anim-uni-in-up" href="https://bazantic.com" target="_blank" rel="noreferrer">{"Bazantic"}</a></li>
                            </ul>
                          </div>
                        </div>
                      </div>
                      <div className="col-12 col-md-4 mxd-grid-item mxd-footer-nav__item">
                        <div className="mxd-footer-nav__block">
                          <div className="mxd-footer-nav__title anim-uni-in-up">
                            <p className="t-140 t-bright t-caption">{"Powered By"}</p>
                          </div>
                          <div className="mxd-footer-nav__list">
                            <ul>
                              <li><a className="anim-uni-in-up" href="https://arc.io" target="_blank" rel="noreferrer">{"Arc"}</a></li>
                              <li><a className="anim-uni-in-up" href="https://circle.com" target="_blank" rel="noreferrer">{"Circle (USDC/EURC)"}</a></li>
                              <li><a className="anim-uni-in-up" href="https://openrouter.ai" target="_blank" rel="noreferrer">{"OpenRouter"}</a></li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </nav>
              </div>
            </div>
          </div>
        </div>


        <div className="mxd-block">
          <div className="mxd-demo-footer__mixdesign mxd-grid-item no-margin">
            <a className="anim-uni-in-up" href="https://ethglobal.com/events/ethonline2026" target="_blank" rel="noreferrer" aria-label="ETHGlobal ETHOnline 2026">
              <span className="mxd-footer-giant-text">{"ETHGLOBAL ETHONLINE 2026"}</span>
            </a>
          </div>
        </div>

      </div>

    </footer>
  </>);
}
