import { githubLoginUrl, type Me } from "../api";

export function WelcomePage({ me, navigate }: { me: Me; navigate: (p: string) => void }) {
    return (
        <div className="welcome">
            <h1>margit</h1>
            <p className="welcome-tagline">
                Sell access to your private GitHub repos. Get paid in USDC on Arc — buyers, human or AI agent, pay
                once and get an authenticated clone URL.
            </p>

            <div className="welcome-actions">
                {me.authenticated ? (
                    <button type="button" className="btn btn-primary" onClick={() => navigate("/profile")}>
                        Go to My Repos
                    </button>
                ) : (
                    <a className="btn btn-primary" href={githubLoginUrl()}>
                        Connect with GitHub
                    </a>
                )}
                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate("/catalog")}
                >
                    Browse Catalog
                </button>
            </div>

            <div className="welcome-steps">
                <div className="welcome-step">
                    <span className="welcome-step-num">1</span>
                    <div>
                        <strong>Connect GitHub</strong>
                        <p className="hint">Sign in to see your repos — nothing is listed automatically.</p>
                    </div>
                </div>
                <div className="welcome-step">
                    <span className="welcome-step-num">2</span>
                    <div>
                        <strong>List a private repo</strong>
                        <p className="hint">Set a price and your Arc payout address (0x, ENS, or ArcNS name).</p>
                    </div>
                </div>
                <div className="welcome-step">
                    <span className="welcome-step-num">3</span>
                    <div>
                        <strong>Get paid, agents included</strong>
                        <p className="hint">
                            A real x402 paywall on Arc testnet — any AI agent can discover, pay, and clone
                            autonomously.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
