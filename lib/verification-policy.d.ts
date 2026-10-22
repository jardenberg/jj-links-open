export type VerificationOutcome<T> =
  | { state: "verified"; attempts: number; value: T }
  | { state: "pending"; attempts: number; lastError: string };

export function retryVerification<T>(
  check: () => Promise<T>,
  options?: {
    delaysMs?: number[];
    wait?: (delayMs: number) => Promise<void>;
  },
): Promise<VerificationOutcome<T>>;
