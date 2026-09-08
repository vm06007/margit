import { useId, useState } from "react";
import { DemoPreview } from "./DemoPreview";

export function DemoGallery() {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  return (<>
    {preview !== null && <DemoPreview initialIndex={preview} onClose={() => setPreview(null)} />}
    <div id="demo" className="mxd-section padding-grid-pre-mtext">
      <div className="mxd-container">

        <div className="mxd-block">
          <div className="mxd-demo-list">

            <div className="mxd-demo-list__row">

              <button type="button" className="mxd-demo-list__item animate-card-2 demo-preview-card" aria-haspopup="dialog" onClick={() => setPreview(0)}>
                <div className="mxd-demo-list__image">
                  <img src="/site/img/demo/screens/01.webp" alt="Margit Demo Screen" />
                  <div className="mxd-demo-list__screen screen-01"></div>
                </div>
                <div className="mxd-demo-list__caption">
                  <span className="mxd-demo-list__link">{"Main Home"}</span>
                  <span className="mxd-demo-list__num">{"/01"}</span>
                </div>
              </button>

              <button type="button" className="mxd-demo-list__item item-accent animate-card-2 demo-preview-card" aria-haspopup="dialog" onClick={() => setPreview(1)}>
                <div className="mxd-demo-list__image">
                  <img src="/site/img/demo/screens/02.webp" alt="Margit Demo Screen" />
                  <div className="mxd-demo-list__screen screen-02"></div>
                </div>
                <div className="mxd-demo-list__caption">
                  <span className="mxd-demo-list__link opposite">{"Software Development Company"}</span>
                  <span className="mxd-demo-list__num opposite">{"/02"}</span>
                </div>
                <div className="mxd-pricing-table__tag">
                  <span className="tag tag-default tag-additional">{"🔥 Hot"}</span>
                </div>
              </button>
            </div>

            <div className="mxd-demo-list__row">

              <button type="button" className="mxd-demo-list__item animate-card-3 demo-preview-card" aria-haspopup="dialog" onClick={() => setPreview(2)}>
                <div className="mxd-demo-list__image">
                  <img src="/site/img/demo/screens/03.webp" alt="Margit Demo Screen" />
                  <div className="mxd-demo-list__screen screen-03"></div>
                </div>
                <div className="mxd-demo-list__caption">
                  <span className="mxd-demo-list__link small">{"Freelancer Portfolio"}</span>
                  <span className="mxd-demo-list__num small">{"/03"}</span>
                </div>
              </button>

              <button type="button" className="mxd-demo-list__item animate-card-3 demo-preview-card" aria-haspopup="dialog" onClick={() => setPreview(3)}>
                <div className="mxd-demo-list__image">
                  <img src="/site/img/demo/screens/04.webp" alt="Margit Demo Screen" />
                  <div className="mxd-demo-list__screen screen-04"></div>
                </div>
                <div className="mxd-demo-list__caption">
                  <span className="mxd-demo-list__link small">{"Digital Agency"}</span>
                  <span className="mxd-demo-list__num small">{"/04"}</span>
                </div>
              </button>

              <button
                type="button"
                className="mxd-demo-list__item empty-item animate-card-3 demo-details-toggle"
                aria-expanded={expanded}
                aria-controls="more-demo-cards"
                onClick={() => setExpanded(value => !value)}
              >
                <span className="mxd-demo-list__image image-placeholder" aria-hidden="true">
                  <img src="/site/img/demo/screens/05.webp" alt="" />
                </span>
                <span className="empty-item__wrap">
                  <span className="empty-item__content">
                    <span className="empty-item__logo mxd-rotate"><DemoCardLogo /></span>
                    <span className="empty-item__caption demo-details-caption">
                      {expanded ? "Show fewer" : "Show more"}<br />details
                    </span>
                  </span>
                </span>
              </button>
            </div>

            <div id="more-demo-cards" className={`demo-details-reveal${expanded ? " is-expanded" : ""}`} aria-hidden={!expanded} inert={!expanded}>
              <div className="demo-details-clip">
                <div className="demo-details-rows">
                  <div className="mxd-demo-list__row">

                    <button type="button" className="mxd-demo-list__item item-accent animate-card-2 demo-preview-card" aria-haspopup="dialog" onClick={() => setPreview(4)}>
                      <div className="mxd-demo-list__image">
                        <img src="/site/img/demo/screens/06.webp" alt="Margit Demo Screen" />
                        <div className="mxd-demo-list__screen screen-06"></div>
                      </div>
                      <div className="mxd-demo-list__caption">
                        <span className="mxd-demo-list__link opposite">{"Personal Portfolio"}</span>
                        <span className="mxd-demo-list__num opposite">{"/06"}</span>
                      </div>
                      <div className="mxd-pricing-table__tag">
                        <span className="tag tag-default tag-additional">{"🔥 Hot"}</span>
                      </div>
                    </button>

                    <button type="button" className="mxd-demo-list__item animate-card-2 demo-preview-card" aria-haspopup="dialog" onClick={() => setPreview(5)}>
                      <div className="mxd-demo-list__image">
                        <img src="/site/img/demo/screens/07.webp" alt="Margit Demo Screen" />
                        <div className="mxd-demo-list__screen screen-07"></div>
                      </div>
                      <div className="mxd-demo-list__caption">
                        <span className="mxd-demo-list__link">{"Web Agency"}</span>
                        <span className="mxd-demo-list__num">{"/07"}</span>
                      </div>
                      <div className="mxd-pricing-table__tag">
                        <span className="tag tag-default tag-accent">{"🦄 Trendy"}</span>
                      </div>
                    </button>
                  </div>

                  <div className="mxd-demo-list__row">

                    <button type="button" className="mxd-demo-list__item animate-card-3 demo-preview-card" aria-haspopup="dialog" onClick={() => setPreview(6)}>
                      <div className="mxd-demo-list__image">
                        <img src="/site/img/demo/screens/08.webp" alt="Margit Demo Screen" />
                        <div className="mxd-demo-list__screen screen-08"></div>
                      </div>
                      <div className="mxd-demo-list__caption">
                        <span className="mxd-demo-list__link small">{"Creative Developer"}</span>
                        <span className="mxd-demo-list__num small">{"/08"}</span>
                      </div>
                    </button>

                    <button type="button" className="mxd-demo-list__item animate-card-3 demo-preview-card" aria-haspopup="dialog" onClick={() => setPreview(7)}>
                      <div className="mxd-demo-list__image">
                        <img src="/site/img/demo/screens/09.webp" alt="Margit Demo Screen" />
                        <div className="mxd-demo-list__screen screen-09"></div>
                      </div>
                      <div className="mxd-demo-list__caption">
                        <span className="mxd-demo-list__link small">{"Designer"}</span>
                        <span className="mxd-demo-list__num small">{"/09"}</span>
                      </div>
                    </button>

                    <div className="mxd-demo-list__item empty-item animate-card-3">
                      <div className="mxd-demo-list__image image-placeholder">
                        <img src="/site/img/demo/screens/05.webp" alt="Margit Demo Screen" />
                      </div>
                      <div className="empty-item__wrap">
                        <div className="empty-item__content">
                          <div className="empty-item__logo mxd-rotate">

                            <DemoCardLogo />
                          </div>
                          <p className="empty-item__caption">{"More demos coming"}<br />{"soon..."}</p>
                        </div>
                      </div>
                    </div>
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

function DemoCardLogo() {
  const id = useId();
  return (<svg aria-hidden="true" className="empty-item__image" version="1.1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 56 56" xmlSpace="preserve">

                        <path fill="var(--accent)" d="M56,28c0,11.1-2.9,28-28,28S0,39.1,0,28S2.9,0,28,0S56,16.9,56,28z"></path>
                        <g>
                          <defs>
                            <path id={`${id}-clip`} d="M28,0C2.9,0,0,16.9,0,28s2.9,28,28,28s28-16.9,28-28S53.1,0,28,0z"></path>
                          </defs>
                          <clipPath id={`${id}-crop`}>
                            <use href={`#${id}-clip`} style={{ "overflow": "visible" }}></use>
                          </clipPath>
                          <path fill="var(--additional)" clipPath={`url(#${id}-crop)`} d="M33.6,34.5h0.9                               c0.5,0,0.9,0.4,0.9,0.9v3.7c0,0.5-0.4,0.9-0.9,0.9h-0.9c-0.5,0-0.9-0.4-0.9-0.9v-3.7C32.7,34.9,33.1,34.5,33.6,34.5z M20.5,37.3                               v1.9c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9-0.4,0.9-0.9v-3.7c0-0.5-0.4-0.9-0.9-0.9h-0.9c-0.5,0-0.9,0.4-0.9,0.9V37.3L20.5,37.3z                               M39.2,21.5v0.9c0,0.5-0.4,0.9-0.9,0.9h-0.9c-0.5,0-0.9-0.4-0.9-0.9v-0.9c0-0.5,0.4-0.9,0.9-0.9h0.9C38.8,20.5,39.2,21,39.2,21.5z                               M34.5,26.1h0.9c0.5,0,0.9-0.4,0.9-0.9v-0.9c0-0.5-0.4-0.9-0.9-0.9h-0.9c-0.5,0-0.9,0.4-0.9,0.9v0.9C33.6,25.7,34,26.1,34.5,26.1z                               M28,26.1h-4.7c-0.5,0-0.9,0.4-0.9,0.9V28c0,0.5,0.4,0.9,0.9,0.9h9.3c0.5,0,0.9-0.4,0.9-0.9v-0.9c0-0.5-0.4-0.9-0.9-0.9H28L28,26.1                               z M19.6,24.3v0.9c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9-0.4,0.9-0.9v-0.9c0-0.5-0.4-0.9-0.9-0.9h-0.9C20,23.3,19.6,23.8,19.6,24.3z                               M16.8,21.5v0.9c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9-0.4,0.9-0.9v-0.9c0-0.5-0.4-0.9-0.9-0.9h-0.9C17.2,20.5,16.8,21,16.8,21.5z                               M14,26.1v4.7c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9-0.4,0.9-0.9v-6.5c0-0.5-0.4-0.9-0.9-0.9h-0.9c-0.5,0-0.9,0.4-0.9,0.9V26.1                               L14,26.1z M11.2,34.5v1.9c0,0.5-0.4,0.9-0.9,0.9H7.5c-0.5,0-0.9,0.4-0.9,0.9v0.9c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9,0.4,0.9,0.9                               V42c0,0.5-0.4,0.9-0.9,0.9H7.5c-0.5,0-0.9,0.4-0.9,0.9v0.9c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9,0.4,0.9,0.9V56                               c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9-0.4,0.9-0.9v-6.5c0-0.5,0.4-0.9,0.9-0.9h3.7c0.5,0,0.9-0.4,0.9-0.9v-0.9                               c0-0.5-0.4-0.9-0.9-0.9h-3.7c-0.5,0-0.9-0.4-0.9-0.9v-6.5c0-0.5,0.4-0.9,0.9-0.9c0.5,0,0.9-0.4,0.9-0.9v-3.7c0-0.5-0.4-0.9-0.9-0.9                               h-0.9c-0.5,0-0.9,0.4-0.9,0.9L11.2,34.5L11.2,34.5z M42,26.1v-1.9c0-0.5-0.4-0.9-0.9-0.9h-0.9c-0.5,0-0.9,0.4-0.9,0.9v6.5                               c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9-0.4,0.9-0.9V26.1L42,26.1z M49.5,39.2v-0.9c0-0.5-0.4-0.9-0.9-0.9h-2.8                               c-0.5,0-0.9-0.4-0.9-0.9v-3.7c0-0.5-0.4-0.9-0.9-0.9h-0.9c-0.5,0-0.9,0.4-0.9,0.9v3.7c0,0.5,0.4,0.9,0.9,0.9c0.5,0,0.9,0.4,0.9,0.9                               v6.5c0,0.5-0.4,0.9-0.9,0.9h-3.7c-0.5,0-0.9,0.4-0.9,0.9v0.9c0,0.5,0.4,0.9,0.9,0.9h3.7c0.5,0,0.9,0.4,0.9,0.9V56                               c0,0.5,0.4,0.9,0.9,0.9h0.9c0.5,0,0.9-0.4,0.9-0.9v-9.3c0-0.5,0.4-0.9,0.9-0.9h0.9c0.5,0,0.9-0.4,0.9-0.9v-0.9                               c0-0.5-0.4-0.9-0.9-0.9h-0.9c-0.5,0-0.9-0.4-0.9-0.9v-0.9c0-0.5,0.4-0.9,0.9-0.9h0.9C49,40.1,49.5,39.7,49.5,39.2L49.5,39.2z"></path>
                        </g>
                      </svg>);
}
