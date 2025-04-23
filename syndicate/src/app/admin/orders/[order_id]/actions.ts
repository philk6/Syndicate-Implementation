'use server';

import { createClient } from '@supabase/supabase-js';

export async function calculateOrderAllocation(orderId: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Fetch order products
    const { data: products, error: productsError } = await supabase
      .from('order_products')
      .select('sequence, quantity, price, cost_price, description, roi')
      .eq('order_id', orderId);

    if (productsError || !products) {
      return { success: false, message: 'Failed to fetch products' };
    }

    // Fetch pre-assignments
    const { data: preAssignments, error: preAssignmentsError } = await supabase
      .from('order_pre_assignments')
      .select('sequence, company_id, quantity')
      .eq('order_id', orderId);

    if (preAssignmentsError) {
      return { success: false, message: 'Failed to fetch pre-assignments' };
    }

    // Fetch company applications
    const { data: applications, error: applicationsError } = await supabase
      .from('order_company')
      .select('company_id, max_investment')
      .eq('order_id', orderId);

    if (applicationsError || !applications) {
      return { success: false, message: 'Failed to fetch applications' };
    }

    // Clear existing allocation results
    await supabase
      .from('allocation_results')
      .delete()
      .eq('order_id', orderId);

    // Example allocation logic (simplified)
    const allocationResults = [];
    for (const product of products) {
      let remainingQuantity = product.quantity;
      const sequence = product.sequence;

      // Handle pre-assignments
      const productPreAssignments = preAssignments.filter(pa => pa.sequence === sequence);
      for (const pa of productPreAssignments) {
        const qty = pa.quantity ?? remainingQuantity;
        if (qty > remainingQuantity) continue;

        allocationResults.push({
          order_id: orderId,
          sequence,
          company_id: pa.company_id,
          quantity: qty,
          roi: product.roi,
          needs_review: false,
          price: product.price,
          cost_price: product.cost_price,
          description: product.description,
        });

        remainingQuantity -= qty;
        if (remainingQuantity <= 0) break;
      }

      // Allocate remaining to applicants
      for (const app of applications) {
        if (remainingQuantity <= 0) break;
        const qty = Math.min(remainingQuantity, Math.floor(app.max_investment / product.price));
        if (qty <= 0) continue;

        allocationResults.push({
          order_id: orderId,
          sequence,
          company_id: app.company_id,
          quantity: qty,
          roi: product.roi,
          needs_review: false,
          price: product.price,
          cost_price: product.cost_price,
          description: product.description,
        });

        remainingQuantity -= qty;
      }
    }

    // Insert allocation results
    const { error: insertError } = await supabase
      .from('allocation_results')
      .insert(allocationResults);

    if (insertError) {
      return { success: false, message: 'Failed to save allocation results' };
    }

    return { success: true, message: 'Allocation calculated successfully' };
  } catch (error) {
    console.error('Error in calculateOrderAllocation:', error);
    return { success: false, message: 'An unexpected error occurred' };
  }
}