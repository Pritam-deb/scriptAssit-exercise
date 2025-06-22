export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    delayMs?: number;
    factor?: number;
    shouldRetry?: (error: any) => boolean;
    onRetry?: (error: any, attempt: number, delay: number) => void;
  } = {},
): Promise<T> {
  const { attempts = 5, delayMs = 1000, factor = 2, shouldRetry = () => true, onRetry } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) break;

      const delay = delayMs * Math.pow(factor, attempt - 1);
      if (onRetry) {
        onRetry(error, attempt, delay);
      } else {
        console.warn(`Retrying (attempt ${attempt}) after error: ${error.message}`);
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }

  throw lastError;
}
