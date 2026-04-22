// ============================================================
// SUPPLIER INTELLIGENCE APP — CORE TYPES
// These types mirror the JSON shapes stored in Prisma Json fields
// and are shared across the scraper, scorer, analyzer, and UI.
// ============================================================

// ============================================================
// ENUMS (mirrored from Prisma schema for use in TS code)
// ============================================================

export type SupplierStatus = "PENDING" | "ANALYZING" | "DONE" | "FAILED";

export type SupplierWorkflowStatus =
  | "REVIEW"
  | "HIGH_PRIORITY"
  | "CONTACTED"
  | "FOLLOW_UP"
  | "RESPONDED"
  | "APPROVED"
  | "REJECTED";

export type Recommendation =
  | "STRONG_CANDIDATE"
  | "NEEDS_REVIEW"
  | "HIGH_RISK";

export type EvidenceCoverage = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type Classification =
  | "BRAND"
  | "DISTRIBUTOR"
  | "WHOLESALER"
  | "RETAILER"
  | "LIQUIDATOR"
  | "MARKETPLACE_SELLER"
  | "UNCLEAR";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export type PriorityLevel = "LOW" | "MEDIUM" | "HIGH";

// Flag severity classification for the improved vetting framework.
// HARD = high-confidence, strongly impacts recommendation
// SOFT = moderate confidence, influences but doesn't determine outcome
export type FlagSeverity = "HARD_GREEN" | "SOFT_GREEN" | "HARD_RED" | "SOFT_RED";

export type OutreachStatus =
  | "NOT_CONTACTED"
  | "READY_TO_CONTACT"
  | "CONTACTED"
  | "FOLLOW_UP_DUE"
  | "REPLIED"
  | "NO_RESPONSE"
  | "APPROVED"
  | "REJECTED";

export type NextActionType =
  | "SEND_FIRST_EMAIL"
  | "FOLLOW_UP"
  | "CALL"
  | "REVIEW_REPLY"
  | "PREP_APPLICATION"
  | "WAIT";

export type OutreachEventType =
  | "EMAIL_DRAFTED"
  | "EMAIL_LOGGED"
  | "FOLLOW_UP_LOGGED"
  | "CALL_LOGGED"
  | "REPLY_LOGGED"
  | "NOTE";

// ============================================================
// PAGE TYPES
// The pages we attempt to scrape for each supplier.
// ============================================================

export type PageType =
  | "homepage"
  | "about"
  | "contact"
  | "wholesale"
  | "reseller"
  | "terms"
  | "faq"
  | "other";

// ============================================================
// SIGNAL CATEGORIES
// Maps to the four score dimensions plus red flags.
// ============================================================

export type SignalCategory =
  | "legitimacy"
  | "wholesale_structure"
  | "supply_chain_doc"
  | "amazon_fit"
  | "red_flag";

// ============================================================
// EXTRACTED SIGNAL
// One signal = one data point found during scraping.
// Each signal records WHERE it was found and WHAT text triggered it.
// ============================================================

export interface ExtractedSignal {
  name: string;
  // The actual value found (true/false for boolean signals, string for text signals)
  value: string | boolean | number | null;
  category: SignalCategory;
  // Which page this signal was found on
  sourcePage: PageType;
  // Verbatim text excerpt from the page that triggered this signal
  snippet?: string;
  // Scoring weight — positive adds to score, negative subtracts (red flag)
  weight: number;
}

// ============================================================
// SCRAPE DIAGNOSTICS
// Full audit trail of what was fetched, HTTP status, redirects, failures.
// ============================================================

export interface PageScrapeResult {
  page: PageType;
  url: string;
  attempted: boolean;
  success: boolean;
  httpStatus?: number;
  // If the request was redirected, record where it ended up
  redirectedTo?: string;
  failureReason?: string;
  contentLength?: number;
  scrapedAt: string; // ISO timestamp
}

export interface ScrapeDiagnostics {
  overallSuccess: boolean;
  baseUrl: string;
  totalPagesAttempted: number;
  totalPagesSucceeded: number;
  pages: PageScrapeResult[];
  notes: string[];
  fetchDurationMs: number;
}

// ============================================================
// SCORE BREAKDOWN
// Each of the four score dimensions is tracked separately.
// The composite score is derived from weighted sum minus penalties.
// This structure is stored in full in the DB so scoring is auditable.
// ============================================================

export interface CategoryScore {
  // Raw score for this dimension, 0–100
  score: number;
  // Weight applied when computing the composite (should sum to 1.0 across all categories)
  weight: number;
  // Max points possible before weighting (for display purposes)
  maxPossible: number;
  // Names of signals that contributed to this score
  signals: string[];
}

export interface ScoreBreakdown {
  legitimacy: CategoryScore;
  wholesaleStructure: CategoryScore;
  supplyChainDoc: CategoryScore;
  amazonWholesaleFit: CategoryScore;
  redFlagPenalty: {
    // Points deducted from the composite (0 = no penalty, 30 = harsh penalty)
    penalty: number;
    signals: string[];
  };
  // Final composite: (sum of weighted category scores) - redFlagPenalty
  composite: number;
}

// ============================================================
// FLAG ENTRIES
// Each flag references its evidence and source page.
// ============================================================

export interface FlagEntry {
  flag: string;
  // Verbatim snippet or extracted value that supports this flag
  evidence?: string;
  sourcePage?: PageType;
  // Flag severity — used by the improved vetting framework
  severity?: FlagSeverity;
}

// ============================================================
// FULL ANALYSIS RESULT
// Returned by lib/analyzer.ts and written to the DB.
// ============================================================

export interface AnalysisResult {
  score: number;
  supplierQualityScore: number;
  amazonFitScore: number;
  priorityLevel: PriorityLevel;
  recommendation: Recommendation;
  classification: Classification;
  confidenceLevel: Confidence;
  evidenceCoverage?: EvidenceCoverage;
  scoreBreakdown: ScoreBreakdown;
  greenFlags: FlagEntry[];
  redFlags: FlagEntry[];
  reasoningSummary: string;
  extractedSignals: ExtractedSignal[];
  scrapeDiagnostics: ScrapeDiagnostics;
  // Raw LLM response preserved for debugging
  rawLlmResponse?: unknown;
}

// ============================================================
// SCRAPED PAGE DATA
// Raw output from lib/scraper.ts for a single page.
// ============================================================

export interface ScrapedPage {
  page: PageType;
  url: string;
  success: boolean;
  httpStatus?: number;
  redirectedTo?: string;
  failureReason?: string;
  // Raw text content extracted from the page (truncated to a safe limit)
  textContent: string;
  // Raw HTML (kept for signal extraction, not stored in DB)
  html: string;
  contentLength: number;
  scrapedAt: string;
}

// ============================================================
// SUPPLIER INPUT
// Used in API routes and forms for creating suppliers.
// ============================================================

export interface SupplierInput {
  companyName: string;
  website?: string;
  notes?: string;
}

// ============================================================
// CHAT / ASSISTANT CONTEXT
// Passed from the supplier detail page to the AI chat widget.
// Lives here (not in a "use client" file) so the API route can
// safely import it without crossing the server/client boundary.
// ============================================================

export interface SupplierContext {
  companyName:      string;
  website?:         string;
  score?:           number;
  recommendation?:  string;
  classification?:  string;
  confidence?:      string;
  greenFlags?:      string[];
  redFlags?:        string[];
  reasoningSummary?: string;
}

// ============================================================
// DISCOVERY TYPES
// Shared enums for the Supplier Discovery feature.
// ============================================================

export type DiscoveryStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export type AuthorizationLevel = "STRONG" | "MODERATE" | "WEAK" | "NONE";

// ============================================================
// DASHBOARD / UI TYPES
// Convenience shapes for the UI layer.
// ============================================================

export interface SupplierRow {
  id: string;
  companyName: string;
  website: string | null;
  status: SupplierStatus;
  workflowStatus: SupplierWorkflowStatus;
  outreachStatus: OutreachStatus;
  nextActionType?: NextActionType | null;
  nextActionDate?: string | null;
  nextActionNote?: string | null;
  createdAt: string;
  updatedAt: string;
  latestAnalysis: {
    id: string;
    score: number;
    supplierQualityScore: number;
    amazonFitScore: number;
    priorityLevel: PriorityLevel;
    recommendation: Recommendation;
    classification: Classification;
    confidenceLevel: Confidence;
    analyzedAt: string;
  } | null;
}

export interface ListWithCount {
  id: string;
  name: string;
  createdAt: string;
  _count: {
    suppliers: number;
  };
}

// ============================================================
// API RESPONSE SHAPES
// ============================================================

export interface ApiError {
  error: string;
  details?: string;
}

export interface ApiSuccess<T> {
  data: T;
}
