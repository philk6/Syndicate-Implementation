export const PREP_GOLD = '#FFD700';
export const PREP_GOLD_DIM = '#B8860B';

export type PrepStatus =
  | 'submitted' | 'in_transit' | 'received' | 'prepping'
  | 'complete' | 'shipped_to_amazon' | 'cancelled';

export const STATUS_COLOR: Record<PrepStatus, string> = {
  submitted:          '#3B82F6', // blue
  in_transit:         '#EAB308', // yellow
  received:           '#F97316', // orange
  prepping:           '#A855F7', // purple
  complete:           '#22C55E', // green
  shipped_to_amazon:  '#14B8A6', // teal
  cancelled:          '#6B7280', // gray
};

export const STATUS_LABEL: Record<PrepStatus, string> = {
  submitted:         'Submitted',
  in_transit:        'In Transit',
  received:          'Received',
  prepping:          'Prepping',
  complete:          'Complete',
  shipped_to_amazon: 'Shipped to Amazon',
  cancelled:         'Cancelled',
};

// Ordered progress path (excludes cancelled)
export const STATUS_FLOW: PrepStatus[] = [
  'submitted', 'in_transit', 'received', 'prepping', 'complete', 'shipped_to_amazon',
];

export const STATUS_COL: Record<PrepStatus, string | null> = {
  submitted:         'submitted_at',
  in_transit:        'in_transit_at',
  received:          'received_at',
  prepping:          'prepping_at',
  complete:          'complete_at',
  shipped_to_amazon: 'shipped_to_amazon_at',
  cancelled:         'cancelled_at',
};

export const INVOICE_STATUS_COLOR: Record<string, string> = {
  pending:   '#EAB308',
  sent:      '#3B82F6',
  paid:      '#22C55E',
  overdue:   '#EF4444',
  cancelled: '#6B7280',
};

export const DOC_TYPES = [
  { value: 'purchase_order',   label: 'Purchase Order' },
  { value: 'invoice',          label: 'Invoice' },
  { value: 'bol',              label: 'Bill of Lading' },
  { value: 'receiving_photo',  label: 'Receiving Photo' },
  { value: 'damage_photo',     label: 'Damage Photo' },
  { value: 'fba_confirmation', label: 'FBA Confirmation' },
  { value: 'other',            label: 'Other' },
];

export const INVOICE_QUICK_ADDS = [
  { description: 'FNSKU Labeling',    unit_price: 0.15 },
  { description: 'Poly Bagging',      unit_price: 0.25 },
  { description: 'Bubble Wrap',       unit_price: 0.50 },
  { description: 'Receiving Fee',     unit_price: 0.10 },
  { description: 'Bundle Assembly',   unit_price: 0.75 },
  { description: 'Oversize Handling', unit_price: 1.00 },
];
