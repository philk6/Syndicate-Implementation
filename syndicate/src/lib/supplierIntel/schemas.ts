/**
 * Zod schemas for every JSON blob written to si_supplier_analyses.
 *
 * Rationale: the original Prisma schema typed these as `Json` with a
 * TS interface at the app layer enforcing shape. Losing Prisma's
 * type contract means we need runtime validation on every write so
 * the scoring UI doesn't silently break on shape drift.
 *
 * Shapes mirror types/index.ts from the source Supplier Intel repo.
 */
import { z } from 'zod';

// Enums (mirror types.ts)
export const zFlagSeverity = z.enum(['HARD_GREEN', 'SOFT_GREEN', 'HARD_RED', 'SOFT_RED']);
export const zSignalCategory = z.enum([
  'legitimacy',
  'wholesale_structure',
  'supply_chain_doc',
  'amazon_fit',
  'red_flag',
]);
export const zPageType = z.enum([
  'homepage',
  'about',
  'contact',
  'wholesale',
  'reseller',
  'terms',
  'faq',
  'other',
]);

// FlagEntry — green/red flag with optional evidence
export const zFlagEntry = z.object({
  flag: z.string(),
  evidence: z.string().optional(),
  sourcePage: z.string().optional(),
  severity: zFlagSeverity.optional(),
});
export type FlagEntry = z.infer<typeof zFlagEntry>;

// ExtractedSignal
export const zExtractedSignal = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  category: zSignalCategory,
  sourcePage: z.string().optional(),
  snippet: z.string().optional(),
  weight: z.number().optional(),
});
export type ExtractedSignal = z.infer<typeof zExtractedSignal>;

// ScoreBreakdown — structured per-category breakdown
export const zScoreBreakdownCategory = z.object({
  score: z.number(),
  weight: z.number(),
  maxPossible: z.number(),
  signals: z.array(zExtractedSignal).optional(),
});
export const zScoreBreakdown = z
  .object({
    legitimacy: zScoreBreakdownCategory.optional(),
    wholesale_structure: zScoreBreakdownCategory.optional(),
    supply_chain_doc: zScoreBreakdownCategory.optional(),
    amazon_fit: zScoreBreakdownCategory.optional(),
  })
  .passthrough(); // allow additional fields for forward-compat
export type ScoreBreakdown = z.infer<typeof zScoreBreakdown>;

// ScrapeDiagnostics
export const zScrapePageAttempt = z.object({
  url: z.string(),
  pageType: zPageType.optional(),
  httpStatus: z.number().optional(),
  success: z.boolean(),
  redirectedTo: z.string().optional(),
  error: z.string().optional(),
  contentLength: z.number().optional(),
});
export const zScrapeDiagnostics = z
  .object({
    overallSuccess: z.boolean(),
    pages: z.array(zScrapePageAttempt),
    totalAttempted: z.number(),
    totalSucceeded: z.number(),
    notes: z.array(z.string()).optional(),
  })
  .passthrough();
export type ScrapeDiagnostics = z.infer<typeof zScrapeDiagnostics>;

// Top-level analysis-row validation
export const zAnalysisRowJSON = z.object({
  scoreBreakdown: zScoreBreakdown,
  greenFlags: z.array(zFlagEntry),
  redFlags: z.array(zFlagEntry),
  extractedSignals: z.array(zExtractedSignal),
  scrapeDiagnostics: zScrapeDiagnostics,
  rawLlmResponse: z.unknown().optional(),
});
export type AnalysisRowJSON = z.infer<typeof zAnalysisRowJSON>;
