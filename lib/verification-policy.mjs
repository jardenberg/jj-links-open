const DEFAULT_DELAYS_MS = [0, 500, 1_000, 2_000, 4_000];

/**
 * Retry an eventually consistent public verification without turning a
 * confirmed control-plane write into a false failure.
 */
export async function retryVerification(check, options = {}) {
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const wait = options.wait ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  let lastError = "Public verification did not complete.";

  for (let index = 0; index < delays.length; index += 1) {
    if (delays[index] > 0) await wait(delays[index]);
    try {
      return { state: "verified", attempts: index + 1, value: await check() };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return { state: "pending", attempts: delays.length, lastError };
}
