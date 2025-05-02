'use server';

import { createClient } from '@supabase/supabase-js';

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