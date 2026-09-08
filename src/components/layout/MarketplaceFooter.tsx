export function MarketplaceFooter() {
return <>
    <footer id="mxd-footer" className="mxd-footer">




      <div className="mxd-footer__footer-blocks">

        <div className="footer-blocks__column animate-card-3">

          <div className="footer-blocks__card fullheight-card">

            <div className="footer-blocks__nav">
              <ul className="footer-nav">
                <li className="footer-nav__item anim-uni-in-up">
                  <a href="/" className="footer-nav__link btn-anim">
                    <span className="btn-caption">{"Home"}</span>
                  </a>
                </li>
                <li className="footer-nav__item anim-uni-in-up">
                  <a href="about-us.html" className="footer-nav__link btn-anim">
                    <span className="btn-caption">{"About us"}</span>
                  </a>
                </li>
                <li className="footer-nav__item anim-uni-in-up">
                  <a href="/works" className="footer-nav__link btn-anim">
                    <span className="btn-caption">{"Works"}</span>
                  </a>
                  <p className="footer-nav__counter">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20px" height="20px" viewBox="0 0 20 20" fill="currentColor">
                      <path fill="currentColor" d="M19.6,9.6c0,0-3,0-4,0c-0.4,0-1.8-0.2-1.8-0.2c-0.6-0.1-1.1-0.2-1.6-0.6c-0.5-0.3-0.9-0.8-1.2-1.2                         c-0.3-0.4-0.4-0.9-0.5-1.4c0,0-0.1-1.1-0.2-1.5c-0.1-1.1,0-4.4,0-4.4C10.4,0.2,10.2,0,10,0S9.6,0.2,9.6,0.4c0,0,0.1,3.3,0,4.4                         c0,0.4-0.2,1.5-0.2,1.5C9.4,6.7,9.2,7.2,9,7.6C8.7,8.1,8.2,8.5,7.8,8.9c-0.5,0.3-1,0.5-1.6,0.6c0,0-1.2,0.1-1.7,0.2                         c-1,0.1-4.2,0-4.2,0C0.2,9.6,0,9.8,0,10c0,0.2,0.2,0.4,0.4,0.4c0,0,3.1-0.1,4.2,0c0.4,0,1.7,0.2,1.7,0.2c0.6,0.1,1.1,0.2,1.6,0.6                         c0.4,0.3,0.8,0.7,1.1,1.1c0.3,0.5,0.5,1,0.6,1.6c0,0,0.1,1.3,0.2,1.7c0,1,0,4.1,0,4.1c0,0.2,0.2,0.4,0.4,0.4s0.4-0.2,0.4-0.4                         c0,0,0-3.1,0-4.1c0-0.4,0.2-1.7,0.2-1.7c0.1-0.6,0.2-1.1,0.6-1.6c0.3-0.4,0.7-0.8,1.1-1.1c0.5-0.3,1-0.5,1.6-0.6                         c0,0,1.3-0.1,1.8-0.2c1,0,4,0,4,0c0.2,0,0.4-0.2,0.4-0.4C20,9.8,19.8,9.6,19.6,9.6L19.6,9.6z"></path>
                    </svg>
                    <span>{"10"}</span>
                  </p>
                </li>
                <li className="footer-nav__item anim-uni-in-up">
                  <a href="/services2" className="footer-nav__link btn-anim">
                    <span className="btn-caption">{"Services"}</span>
                  </a>
                </li>
                <li className="footer-nav__item anim-uni-in-up">
                  <a href="blog-standard.html" className="footer-nav__link btn-anim">
                    <span className="btn-caption">{"Insights"}</span>
                  </a>
                </li>
                <li className="footer-nav__item anim-uni-in-up">
                  <a href="contact.html" className="footer-nav__link btn-anim">
                    <span className="btn-caption">{"Contact"}</span>
                  </a>
                </li>
              </ul>
            </div>

            <div className="footer-blocks__links anim-uni-in-up">
              <a className="btn btn-line-xsmall btn-muted slide-right anim-no-delay" href="#0">
                <span className="btn-caption">{"Privacy Policy"}</span>
                <i className="ph ph-arrow-right"></i>
              </a>
              <a className="btn btn-line-xsmall btn-muted slide-right anim-no-delay" href="#0">
                <span className="btn-caption">{"Terms & conditions"}</span>
                <i className="ph ph-arrow-right"></i>
              </a>
            </div>
          </div>
        </div>

        <div className="footer-blocks__column animate-card-3">

          <div className="footer-blocks__card fill-card notify">

            <div className="footer-blocks__title anim-uni-in-up">
              <p className="footer-blocks__title-m">{"Subscribe to our insights:"}</p>
            </div>

            <div className="form-container anim-uni-in-up">

              <div className="form__reply subscription-ok">
                <span className="reply__text">{"Done! Thanks for subscribing."}</span>
              </div>
              <div className="form__reply subscription-error">
                <span className="reply__text">{"Ooops! Something went wrong. Please try again later."}</span>
              </div>

              <form className="form notify-form form-light" onSubmit={(event) => event.preventDefault()}>
                <input type="email" placeholder="Your Email" required />
                <button className="btn btn-form btn-absolute-right btn-muted slide-right-up anim-no-delay" type="submit" aria-label="Submit">
                  <i className="ph ph-arrow-up-right"></i>
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="footer-blocks__column animate-card-3">

          <div className="footer-blocks__card fullheight-card">

            <div className="footer-blocks__block">

              <div className="footer-blocks__title anim-uni-in-up">
                <p className="footer-blocks__title-l">{"Ecosystem"}</p>
              </div>

              <div className="footer-blocks__socials">
                <ul className="footer-socials">
                  <li className="footer-socials__item anim-uni-in-up"><a href="https://dribbble.com/" className="footer-socials__link" target="_blank">{"Dribbble"}</a></li>
                  <li className="footer-socials__item anim-uni-in-up"><a href="https://www.behance.net/" className="footer-socials__link" target="_blank">{"Behance"}</a></li>
                  <li className="footer-socials__item anim-uni-in-up"><a href="https://www.instagram.com/" className="footer-socials__link" target="_blank">{"Instagram"}</a></li>
                  <li className="footer-socials__item anim-uni-in-up"><a href="https://github.com/" className="footer-socials__link" target="_blank">{"Github"}</a></li>
                  <li className="footer-socials__item anim-uni-in-up"><a href="https://codepen.io/" className="footer-socials__link" target="_blank">{"Codepen"}</a></li>
                  <li className="footer-socials__item anim-uni-in-up"><a href="https://www.figma.com/community" className="footer-socials__link" target="_blank">{"Figma Community"}</a></li>
                </ul>
              </div>
            </div>

            <div className="footer-blocks__links anim-uni-in-up">
              <p className="t-xsmall t-muted">
                <a className="no-effect" href="/">Margit</a>
                <i className="ph-bold ph-copyright"></i>{"\n                2026\n              "}</p>
            </div>
          </div>
        </div>
      </div>

    </footer>
  </>;
}