/** Keep the deadline active while reading the response body as well as headers. */
export async function withRequestTimeout<T>(
    run: (signal: AbortSignal) => Promise<T>,
    milliseconds: number,
    message: string,
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), milliseconds);
    try {
        return await run(controller.signal);
    } catch (error) {
        if (controller.signal.aborted) throw new Error(message);
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
