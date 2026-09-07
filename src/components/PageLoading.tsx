import "../styles/page-loading.css";

export function PageLoading({ label }: { label: string }) {
    return <div className="page-loading" role="status">
        <span className="page-loading-spinner" aria-hidden="true" />
        <p>{label}</p>
    </div>;
}
