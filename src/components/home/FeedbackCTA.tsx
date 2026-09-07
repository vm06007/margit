
export function FeedbackCTA() {
  return (<>
    <div className="mxd-section overflow-hidden">
      <div className="mxd-container">
        <div className="mxd-block">
          <div className="mxd-promo">
            <div className="mxd-promo__inner anim-zoom-out-container">
              <div className="mxd-promo__bg"></div>
              <div className="mxd-promo__content">
                <p className="mxd-promo__title anim-uni-in-up">
                  <span className="mxd-promo__icon">
                    <img src="/site/img/favicon/icon.svg" alt="Margit" />
                  </span>
                  <span className="mxd-promo__caption reveal-type">{"Got feedback or found a bug?"}</span>
                </p>
                <div className="mxd-promo__controls anim-uni-in-up">
                  <a className="btn btn-anim btn-default btn-large btn-additional slide-right-up" href="https://github.com/vm06007/margit" target="_blank" rel="noreferrer">
                    <span className="btn-caption">{"Open on GitHub"}</span>
                    <i className="ph-bold ph-arrow-up-right"></i>
                  </a>
                </div>
              </div>
              <div className="mxd-promo__images">
                <img className="promo-image promo-image-1" src="/site/img/demo/01_hero-img.webp" alt="" />
                <img className="promo-image promo-image-2" src="/site/img/demo/02_hero-img.webp" alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>);
}
