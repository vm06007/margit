
export function MenuContent() {
  return (<>
    <div className="mxd-menu__wrapper">

      <div className="mxd-menu__base"></div>

      <div className="mxd-menu__contain">
        <div className="mxd-menu__inner">

          <div className="mxd-menu__left">
            <p className="mxd-menu__caption menu-fade-in">{"🤖 A GitHub repo marketplace"}<br />{"built for humans and AI agents"}</p>
            <div className="main-menu">
              <nav className="main-menu__content">
                <ul id="main-menu" className="main-menu__accordion">
                  <li className="main-menu__item">
                    <a className="main-menu__link btn btn-anim" href="/">
                      <span className="btn-caption">{"Home"}</span>
                    </a>
                  </li>
                  <li className="main-menu__item">
                    <a className="main-menu__link btn btn-anim" href="/catalog">
                      <span className="btn-caption">{"Catalog"}</span>
                    </a>
                  </li>
                  <li className="main-menu__item">
                    <a className="main-menu__link btn btn-anim" href="/leaderboards">
                      <span className="btn-caption">Leaderboards</span>
                    </a>
                  </li>
                  <li className="main-menu__item">
                    <a className="main-menu__link btn btn-anim" href="/works">
                      <span className="btn-caption">{"My Repos"}</span>
                    </a>
                  </li>
                  <li className="main-menu__item">
                    <a className="main-menu__link btn btn-anim" href="/api/auth/github/login">
                      <span className="btn-caption">{"Connect GitHub"}</span>
                    </a>
                  </li>
                  <li className="main-menu__item">
                    <a className="main-menu__link btn btn-anim" href="https://github.com/vm06007/margit" target="_blank" rel="noreferrer">
                      <span className="btn-caption">{"GitHub Source"}</span>
                    </a>
                  </li>
                  <li className="main-menu__item">
                    <a className="main-menu__link btn btn-anim" href="/agents">
                      <span className="btn-caption">For Agents</span>
                    </a>
                  </li>
                </ul>
              </nav>
            </div>
          </div>

          <div className="mxd-menu__right">
            <div className="menu-promo">
              <div className="menu-promo__content">
                <p className="menu-promo__caption menu-fade-in"><span className="menu-event-caption">Built at ETHGlobal ETHOnline 2026</span><br />{"Sell repos to humans or AI agents, paid in USDC/EURC on Arc Blockchain."}</p>
                <div className="menu-promo__video">
                  <video className="menu-video" id="inner-video" preload="auto" autoPlay loop muted poster="https://dummyimage.com/540x310/5d5d5d/737373" playsInline>
                    <source type="video/mp4" src="/site/video/1920x1080_video-07.mp4" />
                  </video>
                </div>
              </div>
            </div>
          </div>

          <div className="mxd-menu__data menu-fade-in">
            <p className="t-xsmall">{"\n            Made with\n            "}<i className="ph-fill ph-heart t-additional"></i>{"\n            for\n            "}<a className="no-effect" href="https://ethglobal.com/events/ethonline2026" target="_blank" rel="noreferrer">{"ETHGlobal ETHOnline 2026"}</a>
            </p>
            <p className="t-xsmall">
              <i className="ph ph-copyright"></i>{"\n            2026 by "}<a href="https://github.com/vm06007" target="_blank" rel="noreferrer" className="no-effect">{"Vitalik Marinčenko"}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  </>);
}
