
export function AmbientVideo() {
  return (<>
    <div className="mxd-section padding-default">
      <div className="mxd-container">
        <div className="mxd-block">
          <div className="mxd-hero-01__video-wrap loading__item" style={{ "position": "relative", "width": "100%", "borderRadius": "2rem", "overflow": "hidden" }}>
            <video className="mxd-hero-01__video" style={{ "width": "100%", "display": "block" }} preload="auto" autoPlay muted loop playsInline poster="/site/img/demo/01-footer.webp">
              <source type="video/mp4" src="/site/video/1920x1080_video-07.mp4" />
            </video>
          </div>
        </div>
      </div>
    </div>
  </>);
}
