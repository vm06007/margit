import { RevealText } from "./RevealText";

const directions = [
  ["Human", "Human", "user", "user"],
  ["Human", "Agent", "user", "robot"],
  ["Agent", "Human", "robot", "user"],
  ["Agent", "Agent", "robot", "robot"],
];

export function ResponsivePromo() {
  return (
    <section className="mxd-section home-market-directions">
      <div className="mxd-container">
        <div className="market-directions">
          <div className="market-directions-grid">
            {directions.map(([from, to, fromIcon, toIcon]) => (
              <div className="market-direction" key={`${from}-${to}`}>
                <div className="market-direction-icons" aria-hidden="true"><i className={`ph ph-${fromIcon}`} /><span>↗</span><i className={`ph ph-${toIcon}`} /></div>
                <p>{from} <span aria-hidden="true">→</span> {to}</p>
              </div>
            ))}
          </div>
          <div className="market-directions-copy">
            <p className="reveal-type"><RevealText text="A marketplace in every direction — human to human, human to agent, agent to human, and agent to agent." /></p>
          </div>
        </div>
      </div>
    </section>
  );
}
