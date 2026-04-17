import { useCallback, useRef } from 'react';
import { useAuth } from '@lib/auth';

interface NetworkOptions {
  timeout?: number;
  retries?: number;
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
        timeout = 15000, // 15 seconds default timeout
        retries = 2,
        retryDelay = 1000
      } = options;

      const abortController = new AbortController();
      abortControllersRef.current.add(abortController);

      try {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error(`Network request timeout after ${timeout}ms`));
              }, timeout);

              abortController.signal.addEventListener('abort', () => {
                if (timeoutId !== null) clearTimeout(timeoutId);
              });
            });

            const result = await Promise.race([
              operation(abortController.signal),
              timeoutPromise
            ]);

            // Clear timeout on success (prevents stale timer firing after GC)
            if (timeoutId !== null) clearTimeout(timeoutId);

            return result;
          } catch (error) {
            lastError = error as Error;
            
            // Don't retry if aborted or if it's the last attempt
            if (abortController.signal.aborted || attempt === retries) {
              throw error;
            }

            // Don't retry certain types of errors
            if (
              lastError.message.includes('401') ||
              lastError.message.includes('403') ||
              lastError.message.includes('404')
            ) {
              throw error;
            }

            // Wait before retrying, with exponential backoff
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        throw lastError;
      } finally {
        abortControllersRef.current.delete(abortController);
      }
    },
    []
  );

  // Cleanup function to abort all ongoing requests
  const abortAllRequests = useCallback(() => {
    abortControllersRef.current.forEach(controller => {
      controller.abort();
    });
    abortControllersRef.current.clear();
  }, []);

  return {
    withNetworkResilience,
    abortAllRequests,
    isTabActive
  };
} 