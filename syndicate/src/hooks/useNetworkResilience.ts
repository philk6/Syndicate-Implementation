import { useCallback, useRef } from 'react';
import { useAuth } from '@lib/auth';

interface NetworkOptions {
  /** Hard timeout per attempt in ms. Default 10s. */
  timeout?: number;
  /** Number of additional retries after the first attempt. Default 0 (fail fast). */
  retries?: number;
  /** Base delay between retries in ms (doubled per retry). Default 1s. */
  retryDelay?: number;
}

export function useNetworkResilience() {
  const { isTabActive } = useAuth();
  const abortControllersRef = useRef<Set<AbortController>>(new Set());

  const withNetworkResilience = useCallback(
    async <T>(
      operation: (signal: AbortSignal) => Promise<T>,
      options: NetworkOptions = {}
    ): Promise<T> => {
      const {
        // 10s default matches the Supabase browser client's own fetch timeout
        // (lib/supabase/client.ts::timeoutFetch). Stacking longer timeouts on
        // top produced the "spinner for 60+ seconds" behaviour that made it
        // look like the page was hung.
        timeout = 10000,
        // Default to zero retries: a real query responds in <1s on our
        // schema, so multi-retry just delays surfacing a legitimate error.
        // Callers that really need retries can opt in explicitly.
        retries = 0,
        retryDelay = 1000,
      } = options;

      const abortController = new AbortController();
      abortControllersRef.current.add(abortController);

      try {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
          // A fresh listener set per attempt — binding the abort listener to
          // the outer controller on every iteration (as the previous code
          // did) leaked one listener per retry. Using a per-attempt
          // controller keeps cleanup scoped.
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`Network request timeout after ${timeout}ms`));
            }, timeout);
          });

          try {
            const result = await Promise.race([
              operation(abortController.signal),
              timeoutPromise,
            ]);

            if (timeoutId !== null) clearTimeout(timeoutId);
            return result;
          } catch (error) {
            if (timeoutId !== null) clearTimeout(timeoutId);
            lastError = error as Error;

            // Don't retry if aborted externally or if we've exhausted retries.
            if (abortController.signal.aborted || attempt === retries) {
              throw error;
            }

            // Don't retry on client errors — they won't get better.
            if (
              lastError.message.includes('401') ||
              lastError.message.includes('403') ||
              lastError.message.includes('404')
            ) {
              throw error;
            }

            // Exponential backoff for the few cases that do retry.
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        throw lastError;
      } finally {
        abortControllersRef.current.delete(abortController);
      }
    },
    []
  );

  const abortAllRequests = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    abortControllersRef.current.clear();
  }, []);

  return {
    withNetworkResilience,
    abortAllRequests,
    isTabActive,
  };
}
