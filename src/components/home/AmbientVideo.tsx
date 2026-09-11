
export function AmbientVideo() {
  return (<>
    <div className="mxd-section padding-default">
      <div className="mxd-container">
        <div className="mxd-block">
          <div className="ambient-video">
            <video className="ambient-video__media" preload="auto" autoPlay muted loop playsInline poster="/site/img/demo/01-footer.webp">
              <source type="video/mp4" src="/site/video/1920x1080_video-07.mp4" />
            </video>
            <img className="ambient-video__logo" src="/arc-logo.svg" alt="Arc" width="146" height="50" />
          </div>
        </div>
      </div>
    </div>
  </>);
}
