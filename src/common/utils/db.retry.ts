export async function retry<T>(
    fn: () => Promise<T>,
    options: {
        attempts?: number;
        delayMs?: number;
        factor?: number;
        shouldRetry?: (error: any) => boolean;
    } = {},
): Promise<T> {
    const { attempts = 5, delayMs = 1000, factor = 2, shouldRetry = () => true } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === attempts || !shouldRetry(error)) break;

            const delay = delayMs * Math.pow(factor, attempt - 1);
            await new Promise(res => setTimeout(res, delay));
        }
    }

    throw lastError;
}
