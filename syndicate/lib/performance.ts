/**
 * Performance monitoring utilities for tracking slow operations
 */

// Enable debug mode in development
const DEBUG = process.env.NODE_ENV === 'development';

// Track performance metrics during request processing
export class PerformanceTracker {
  private startTime: number;
  private markers: Record<string, number> = {};
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
    this.startTime = performance.now();
  }

  /**
   * Mark a point in time during the execution
   */
  mark(label: string): void {
    this.markers[label] = performance.now();
    
    if (DEBUG) {
      const elapsed = this.markers[label] - this.startTime;
      console.log(`[PERF ${this.name}] ${label}: ${elapsed.toFixed(2)}ms`);
    }
  }

  /**
   * End tracking and return the total duration
   */
  end(logResults = true): number {
    const endTime = performance.now();
    const totalDuration = endTime - this.startTime;
    
    if (logResults) {
      // Log individual steps
      let lastTime = this.startTime;
      const steps: { label: string; duration: number }[] = [];
      
      Object.entries(this.markers).forEach(([label, time]) => {
        steps.push({
          label,
          duration: time - lastTime
        });
        lastTime = time;
      });
      
      // Add final step
      steps.push({
        label: 'End',
        duration: endTime - lastTime
      });
      
      // Log results
      if (DEBUG || totalDuration > 1000) { // Always log if over 1 second
        console.log(`[PERF ${this.name}] Total: ${totalDuration.toFixed(2)}ms`);
        steps.forEach(step => {
          console.log(`  ${step.label}: ${step.duration.toFixed(2)}ms`);
        });
      }
    }
    
    return totalDuration;
  }
}

/**
 * Measure the execution time of an async function
 */
export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    if (DEBUG || duration > 500) { // Log if over 500ms
      console.log(`[PERF] ${name} took ${duration.toFixed(2)}ms`);
    }
  }
}

/**
 * Create a wrapped version of a function that measures its execution time
 */
export function createMeasuredFunction<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string, 
  fn: T
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return measureAsync(name, () => fn(...args)) as Promise<ReturnType<T>>;
  }) as T;
} 