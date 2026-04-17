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

export async function calculateOrderAllocation(orderId: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Clear existing allocation results to ensure fresh data
    const { error: deleteError } = await supabase
      .from('allocation_results')
      .delete()
      .eq('order_id', orderId);

    if (deleteError) {
      console.error('Delete allocation results error:', deleteError);
      return { success: false, message: 'Failed to clear existing allocation results' };
    }

    // Call the Python backend endpoint
    if (!process.env.BACKEND_URL) {
      return { success: false, message: 'BACKEND_URL environment variable is not configured' };
    }
    const backendUrl = `${process.env.BACKEND_URL}/allocate/${orderId}`;
    console.log(`Calling backend endpoint: ${backendUrl}`);
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Add any necessary authentication headers if required
      },
      cache: 'no-store', // Prevent caching of the response
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Backend allocation error:', errorData);
      return { success: false, message: `Backend allocation failed: ${errorData.detail || 'Unknown error'}` };
    }

    const result = await response.json();
    console.log('Backend allocation result:', result);

    // Fetch allocation results from the database
    const { data: allocationResults, error: fetchAllocError } = await supabase
      .from('allocation_results')
      .select('order_id, sequence, company_id, quantity, invested_amount, profit')
      .eq('order_id', orderId);

    if (fetchAllocError) {
      console.error('Fetch allocation results error:', fetchAllocError);
      return { success: false, message: 'Failed to fetch allocation results' };
    }

    // Fetch company ROI from order_company
    const { data: companyRoiData, error: fetchRoiError } = await supabase
      .from('order_company')
      .select('company_id, max_investment, roi, needs_review')
      .eq('order_id', orderId);

    if (fetchRoiError) {
      console.error('Fetch order_company error:', fetchRoiError);
      return { success: false, message: 'Failed to fetch company ROI data' };
    }

    console.log('Fetched allocation results:', allocationResults);
    console.log('Fetched company ROI data:', companyRoiData);

    return {
      success: true,
      message: 'Allocation calculated successfully',
      allocations: allocationResults,
      company_roi: companyRoiData,
    };
  } catch (error) {
    console.error('Error in calculateOrderAllocation:', error);
    return { success: false, message: `An unexpected error occurred: ${(error as Error).message}` };
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