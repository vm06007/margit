export function AuthErrorPage() {
    const reason = new URLSearchParams(window.location.search).get('reason');
    const cancelled = reason === 'cancelled';
    const expired = reason === 'expired';
    return <section className="repository-page auth-error-page">
        <p>GitHub connection</p>
        <h1>{cancelled ? 'Connection cancelled' : expired ? 'Connection expired' : 'Could not connect GitHub'}</h1>
        <p className="auth-error-description">
            {cancelled
                ? 'You cancelled GitHub authorization. You can try again whenever you’re ready, or keep browsing the catalog.'
                : expired
                    ? 'This sign-in link has expired or was already used. Start again to connect your GitHub account.'
                    : 'We couldn’t finish connecting your GitHub account. Please try again.'}
        </p>
        <div className="agent-integration-links">
            <a className="btn btn-secondary" href="/api/auth/github/login">Try again ↗</a>
            <a className="btn btn-secondary" href="/catalog">Browse Catalog ↗</a>
        </div>
    </section>;
}
