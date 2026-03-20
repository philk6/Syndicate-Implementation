'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

export async function revokeAndRefundAllocationAction(allocationId: number): Promise<{ success: boolean; message: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // Create a service-role client to bypass RLS for the admin check
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Get the user's session token from cookies to identify who they are
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('sb-access-token')?.value;
  const refreshToken = cookieStore.get('sb-refresh-token')?.value;

  // Try to get the user from the Supabase auth using the anon client
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);

  // Attempt to set session from cookies  
  let userId: string | null = null;

  if (accessToken && refreshToken) {
    const { data: sessionData } = await supabaseAuth.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    userId = sessionData?.user?.id || null;
  }

  if (!userId) {
    // Fallback: try to get user from the auth header (Next.js middleware might pass it)
    const { data: { user } } = await supabaseAuth.auth.getUser();
    userId = user?.id || null;
  }

  if (!userId) {
    return { success: false, message: 'Unauthorized: Could not identify the current user.' };
  }

  // Verify the user is an admin
  const { data: userData, error: userError } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (userError || !userData) {
    return { success: false, message: 'Unauthorized: Could not verify user role.' };
  }

  if (userData.role !== 'admin') {
    return { success: false, message: 'Forbidden: Only administrators can revoke allocations.' };
  }

  // Call the RPC function
  const { error: rpcError } = await supabaseAdmin.rpc('remove_allocation_and_refund', {
    p_allocation_id: allocationId,
    p_admin_user_id: userId,
  });

  if (rpcError) {
    console.error('RPC remove_allocation_and_refund error:', rpcError);
    return { success: false, message: `Failed to revoke allocation: ${rpcError.message}` };
  }

  // Revalidate all admin order pages so the UI updates
  revalidatePath('/admin/orders/[order_id]');

  return { success: true, message: 'Allocation revoked and credit refunded successfully.' };
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
    const backendUrl = `${process.env.BACKEND_URL || 'https://fsaa-test.up.railway.app'}/allocate/${orderId}`;
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