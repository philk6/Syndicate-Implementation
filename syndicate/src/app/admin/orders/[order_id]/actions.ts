'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

export async function revokeAndRefundAllocationAction(
  allocationId: number,
  adminUserId: string
): Promise<{ success: boolean; message: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!adminUserId) {
    return { success: false, message: 'Unauthorized: No admin user ID provided.' };
  }

  // Use service-role client (same pattern as calculateOrderAllocation)
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Double-check admin role on the server side before calling the RPC
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('user_id', adminUserId)
    .single();

  if (userError || !userData || userData.role !== 'admin') {
    return { success: false, message: 'Forbidden: Only administrators can revoke allocations.' };
  }

  // Call the RPC function — it now RETURNS NUMERIC (the actual refund amount)
  const { data: refundAmount, error: rpcError } = await supabase.rpc('remove_allocation_and_refund', {
    p_allocation_id: allocationId,
    p_admin_user_id: adminUserId,
  });

  if (rpcError) {
    console.error('RPC remove_allocation_and_refund error:', rpcError);
    return { success: false, message: `Failed to revoke allocation: ${rpcError.message}` };
  }

  // Revalidate the admin order page so the UI updates
  revalidatePath('/admin/orders/[order_id]');

  // Build a dynamic message based on the actual refund amount
  const amount = typeof refundAmount === 'number' ? refundAmount : parseFloat(refundAmount ?? '0');

  if (amount > 0) {
    return {
      success: true,
      message: `Successfully removed allocation. Refunded $${amount.toFixed(2)} based on recalculated order charge.`,
    };
  } else {
    return {
      success: true,
      message: `Allocation removed. $0.00 refunded (company's remaining allocations still exceed their max investment cap).`,
    };
  }
}

export type CalculateAllocationReason =
  | 'order_not_found'
  | 'backend_not_configured'
  | 'backend_misconfigured'
  | 'backend_unreachable'
  | 'allocation_cleanup_failed'
  | 'allocation_fetch_failed'
  | 'unexpected_error';

export interface CalculateAllocationResult {
  success: boolean;
  message: string;
  reason?: CalculateAllocationReason;
  // Included on success; empty on failure.
  allocations?: Array<{
    order_id: number;
    sequence: number;
    company_id: number;
    quantity: number;
    invested_amount: number | null;
    profit: number | null;
  }>;
  company_roi?: Array<{ company_id: number; max_investment: number | null; roi: number | null; needs_review: boolean }>;
}

export async function calculateOrderAllocation(orderId: number): Promise<CalculateAllocationResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Pre-flight: does this order actually exist in OUR Supabase? Skip the
    // round-trip to the Python allocator if not — it would only produce the
    // same "No order found" error from the other side of the wire.
    const { data: orderRow, error: orderLookupError } = await supabase
      .from('orders')
      .select('order_id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (orderLookupError) {
      console.error('[calculateOrderAllocation] orders pre-flight lookup failed:', {
        orderId,
        error: orderLookupError,
      });
      return {
        success: false,
        reason: 'unexpected_error',
        message: `Could not verify order #${orderId}: ${orderLookupError.message}`,
      };
    }
    if (!orderRow) {
      return {
        success: false,
        reason: 'order_not_found',
        message: `Order #${orderId} does not exist. It may have been deleted or the URL is stale.`,
      };
    }

    // Clear existing allocation results to ensure fresh data
    const { error: deleteError } = await supabase
      .from('allocation_results')
      .delete()
      .eq('order_id', orderId);

    if (deleteError) {
      console.error('[calculateOrderAllocation] allocation_results delete failed:', {
        orderId,
        error: deleteError,
      });
      return {
        success: false,
        reason: 'allocation_cleanup_failed',
        message: 'Failed to clear existing allocation results',
      };
    }

    // Call the Python backend endpoint
    if (!process.env.BACKEND_URL) {
      return {
        success: false,
        reason: 'backend_not_configured',
        message: 'The allocation service URL (BACKEND_URL) is not configured on this deployment.',
      };
    }
    const backendUrl = `${process.env.BACKEND_URL}/allocate/${orderId}`;
    console.log(`[calculateOrderAllocation] calling backend ${backendUrl}`);

    let response: Response;
    try {
      response = await fetch(backendUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
    } catch (networkErr) {
      console.error('[calculateOrderAllocation] backend unreachable:', {
        orderId,
        backendUrl,
        error: networkErr instanceof Error ? networkErr.message : String(networkErr),
      });
      return {
        success: false,
        reason: 'backend_unreachable',
        message:
          'The allocation service is unreachable. This is a deployment issue — check that the Python allocator service is running and that BACKEND_URL points to it.',
      };
    }

    if (!response.ok) {
      const rawBody = await response.text().catch(() => '(unreadable body)');
      let detail: string | undefined;
      try {
        detail = JSON.parse(rawBody)?.detail;
      } catch {
        /* not JSON */
      }

      console.error('[calculateOrderAllocation] backend returned non-2xx:', {
        orderId,
        backendUrl,
        status: response.status,
        statusText: response.statusText,
        body: rawBody,
      });

      // The Syndicate Supabase already confirmed the order exists above, so if
      // the allocator says "no order found," the allocator is reading from a
      // different / stale database. Surface that specifically so it isn't
      // mistaken for a frontend bug.
      if (detail && /no order found/i.test(detail)) {
        return {
          success: false,
          reason: 'backend_misconfigured',
          message:
            `The allocation service reports order #${orderId} doesn't exist, but Syndicate's database shows it does. ` +
            `The Python allocator is likely connected to a different or stale database — check its SUPABASE_URL / SUPABASE_DB credentials on Railway.`,
        };
      }

      return {
        success: false,
        reason: 'backend_misconfigured',
        message: `Allocation service returned ${response.status}: ${detail ?? response.statusText ?? 'no detail'}`,
      };
    }

    const result = await response.json();
    console.log('[calculateOrderAllocation] backend success:', result);

    // Fetch allocation results from the database
    const { data: allocationResults, error: fetchAllocError } = await supabase
      .from('allocation_results')
      .select('order_id, sequence, company_id, quantity, invested_amount, profit')
      .eq('order_id', orderId);

    if (fetchAllocError) {
      console.error('[calculateOrderAllocation] allocation_results fetch failed:', {
        orderId,
        error: fetchAllocError,
      });
      return {
        success: false,
        reason: 'allocation_fetch_failed',
        message: 'Failed to fetch allocation results',
      };
    }

    // Fetch company ROI from order_company
    const { data: companyRoiData, error: fetchRoiError } = await supabase
      .from('order_company')
      .select('company_id, max_investment, roi, needs_review')
      .eq('order_id', orderId);

    if (fetchRoiError) {
      console.error('[calculateOrderAllocation] order_company fetch failed:', {
        orderId,
        error: fetchRoiError,
      });
      return {
        success: false,
        reason: 'allocation_fetch_failed',
        message: 'Failed to fetch company ROI data',
      };
    }

    return {
      success: true,
      message: 'Allocation calculated successfully',
      allocations: (allocationResults ?? []) as CalculateAllocationResult['allocations'],
      company_roi: (companyRoiData ?? []) as CalculateAllocationResult['company_roi'],
    };
  } catch (error) {
    console.error('[calculateOrderAllocation] unexpected error:', error);
    return {
      success: false,
      reason: 'unexpected_error',
      message: `An unexpected error occurred: ${(error as Error).message}`,
    };
  }
}

// --- Shortfall Adjustment (Largest Remainder Method) ---

export interface ShortfallAdjustment {
  company_id: number;
  new_quantity: number;
  units_lost: number;
  refund_amount: number;
}

export async function calculateShortfallAdjustments(
  orderId: number,
  sequence: number,
  actualStock: number
): Promise<{ success: boolean; message: string; adjustments?: ShortfallAdjustment[] }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Fetch current allocations for this specific product
    const { data: allocations, error: allocError } = await supabase
      .from('allocation_results')
      .select('company_id, quantity, invested_amount')
      .eq('order_id', orderId)
      .eq('sequence', sequence);

    if (allocError) {
      console.error('Error fetching allocations:', allocError);
      return { success: false, message: `Failed to fetch allocations: ${allocError.message}` };
    }

    if (!allocations || allocations.length === 0) {
      return { success: false, message: 'No allocations found for this product.' };
    }

    // 2. No longer need to fetch price — refund is based on invested_amount
    const totalAllocated = allocations.reduce((sum, a) => sum + a.quantity, 0);

    // Guard: actualStock must be less than totalAllocated (otherwise no shortfall)
    if (actualStock >= totalAllocated) {
      return {
        success: false,
        message: `Actual stock (${actualStock}) is not less than total allocated (${totalAllocated}). No shortfall to process.`,
      };
    }

    if (actualStock < 0) {
      return { success: false, message: 'Actual stock cannot be negative.' };
    }

    // 3. Largest Remainder Method
    //    - Multiply each allocation by (actualStock / totalAllocated), floor the result
    //    - Distribute the remaining units to companies with the highest decimal fractions
    const ratio = actualStock / totalAllocated;

    const intermediate = allocations.map((a) => {
      const exact = a.quantity * ratio;
      const floored = Math.floor(exact);
      const remainder = exact - floored;
      return {
        company_id: a.company_id as number,
        original_quantity: a.quantity as number,
        invested_amount: Number(a.invested_amount ?? 0),
        floored,
        remainder,
      };
    });

    const flooredTotal = intermediate.reduce((sum, i) => sum + i.floored, 0);
    let unitsToDistribute = actualStock - flooredTotal;

    // Sort by remainder descending to give extra units to highest fractions first
    const sorted = [...intermediate].sort((a, b) => b.remainder - a.remainder);

    for (const entry of sorted) {
      if (unitsToDistribute <= 0) break;
      entry.floored += 1;
      unitsToDistribute -= 1;
    }

    // 4. Build the adjustments array
    //    Refund is the proportional reduction of invested_amount (what the company actually paid),
    //    NOT units_lost * retail price (which ignores the max_investment cap).
    const adjustments: ShortfallAdjustment[] = intermediate.map((entry) => {
      const unitsLost = entry.original_quantity - entry.floored;
      const refund = entry.original_quantity > 0
        ? entry.invested_amount * (unitsLost / entry.original_quantity)
        : 0;
      return {
        company_id: entry.company_id,
        new_quantity: entry.floored,
        units_lost: unitsLost,
        refund_amount: parseFloat(refund.toFixed(2)),
      };
    });

    return {
      success: true,
      message: `Shortfall adjustments calculated. Reducing from ${totalAllocated} to ${actualStock} units across ${adjustments.length} companies.`,
      adjustments,
    };
  } catch (error) {
    console.error('Error in calculateShortfallAdjustments:', error);
    return { success: false, message: `An unexpected error occurred: ${(error as Error).message}` };
  }
}

export async function applyShortfallAdjustments(
  orderId: number,
  sequence: number,
  actualStock: number,
  adminUserId: string,
  adjustments: ShortfallAdjustment[]
): Promise<{ success: boolean; message: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { error: rpcError } = await supabase.rpc('apply_shortfall_adjustments', {
      p_order_id: orderId,
      p_sequence: sequence,
      p_actual_stock: actualStock,
      p_admin_user_id: adminUserId,
      p_adjustments: adjustments,
    });

    if (rpcError) {
      console.error('RPC apply_shortfall_adjustments error:', rpcError);
      return { success: false, message: `Failed to apply shortfall: ${rpcError.message}` };
    }

    revalidatePath('/admin/orders/[order_id]');

    const totalRefund = adjustments.reduce((sum, a) => sum + a.refund_amount, 0);
    return {
      success: true,
      message: `Shortfall applied successfully. ${adjustments.filter(a => a.units_lost > 0).length} companies adjusted, $${totalRefund.toFixed(2)} total refunded.`,
    };
  } catch (error) {
    console.error('Error in applyShortfallAdjustments:', error);
    return { success: false, message: `An unexpected error occurred: ${(error as Error).message}` };
  }
}