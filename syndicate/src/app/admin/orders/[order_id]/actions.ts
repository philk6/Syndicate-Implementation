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
      console.error('Products fetch error:', productsError);
      return { success: false, message: 'Failed to fetch products' };
    }

    // Fetch pre-assignments
    const { data: preAssignments, error: preAssignmentsError } = await supabase
      .from('order_pre_assignments')
      .select('sequence, company_id, quantity')
      .eq('order_id', orderId);

    if (preAssignmentsError) {
      console.error('Pre-assignments fetch error:', preAssignmentsError);
      return { success: false, message: 'Failed to fetch pre-assignments' };
    }

    // Fetch company applications
    const { data: applications, error: applicationsError } = await supabase
      .from('order_company')
      .select('company_id, max_investment')
      .eq('order_id', orderId);

    if (applicationsError || !applications) {
      console.error('Applications fetch error:', applicationsError);
      return { success: false, message: 'Failed to fetch applications' };
    }

    // Fetch discounted prices
    const { data: discountedPrices, error: discountedPricesError } = await supabase
      .from('order_products_company')
      .select('sequence, company_id, discounted_price')
      .eq('order_id', orderId)
      .not('discounted_price', 'is', null);

    if (discountedPricesError) {
      console.error('Discounted prices fetch error:', discountedPricesError);
      return { success: false, message: 'Failed to fetch discounted prices' };
    }

    // Create a lookup for discounted prices
    const discountLookup: { [key: string]: number } = {};
    for (const dp of discountedPrices) {
      const key = `${dp.sequence}-${dp.company_id}`;
      discountLookup[key] = dp.discounted_price;
    }

    // Clear existing allocation results
    const { error: deleteError } = await supabase
      .from('allocation_results')
      .delete()
      .eq('order_id', orderId);

    if (deleteError) {
      console.error('Delete allocation results error:', deleteError);
      return { success: false, message: 'Failed to clear existing allocation results' };
    }

    // Allocation logic
    const allocationResults = [];
    const companyAllocations: { [companyId: number]: { totalProfit: number; totalInvested: number } } = {};

    for (const product of products) {
      let remainingQuantity = product.quantity;
      const sequence = product.sequence;

      // Handle pre-assignments
      const productPreAssignments = preAssignments.filter(pa => pa.sequence === sequence);
      for (const pa of productPreAssignments) {
        const qty = pa.quantity ?? remainingQuantity;
        if (qty > remainingQuantity) continue;

        // Use discounted price if available, otherwise use original price
        const key = `${sequence}-${pa.company_id}`;
        const effectivePrice = discountLookup[key] ?? product.price;
        const investedAmount = effectivePrice * qty;
        const profit = (product.roi / 100) * investedAmount;

        allocationResults.push({
          order_id: orderId,
          sequence,
          company_id: pa.company_id,
          quantity: qty,
          profit,
          invested_amount: investedAmount,
        });

        // Track for company-level ROI
        if (!companyAllocations[pa.company_id]) {
          companyAllocations[pa.company_id] = { totalProfit: 0, totalInvested: 0 };
        }
        companyAllocations[pa.company_id].totalProfit += profit;
        companyAllocations[pa.company_id].totalInvested += investedAmount;

        remainingQuantity -= qty;
        if (remainingQuantity <= 0) break;
      }

      // Allocate remaining to applicants
      for (const app of applications) {
        if (remainingQuantity <= 0) break;

        // Skip if company already has a pre-assignment for this sequence
        if (productPreAssignments.some(pa => pa.company_id === app.company_id)) continue;

        // Use discounted price if available, otherwise use original price
        const key = `${sequence}-${app.company_id}`;
        const effectivePrice = discountLookup[key] ?? product.price;
        const qty = Math.min(remainingQuantity, Math.floor(app.max_investment / effectivePrice));
        if (qty <= 0) continue;

        const investedAmount = effectivePrice * qty;
        const profit = (product.roi / 100) * investedAmount;

        allocationResults.push({
          order_id: orderId,
          sequence,
          company_id: app.company_id,
          quantity: qty,
          profit,
          invested_amount: investedAmount,
        });

        // Track for company-level ROI
        if (!companyAllocations[app.company_id]) {
          companyAllocations[app.company_id] = { totalProfit: 0, totalInvested: 0 };
        }
        companyAllocations[app.company_id].totalProfit += profit;
        companyAllocations[app.company_id].totalInvested += investedAmount;

        remainingQuantity -= qty;
      }
    }

    // Validate for duplicate keys
    const keySet = new Set<string>();
    for (const result of allocationResults) {
      const key = `${result.order_id}-${result.sequence}-${result.company_id}`;
      if (keySet.has(key)) {
        console.error(`Duplicate allocation key detected: order_id=${result.order_id}, sequence=${result.sequence}, company_id=${result.company_id}`);
        return { success: false, message: `Duplicate allocation key: order_id=${result.order_id}, sequence=${result.sequence}, company_id=${result.company_id}` };
      }
      keySet.add(key);
    }

    // Insert allocation results using UPSERT
    console.log('Allocation results payload:', allocationResults);
    for (const result of allocationResults) {
      const { error: upsertError } = await supabase
        .from('allocation_results')
        .upsert(
          {
            order_id: result.order_id,
            sequence: result.sequence,
            company_id: result.company_id,
            quantity: result.quantity,
            invested_amount: result.invested_amount,
            profit: result.profit,
            roi: null, // ROI is calculated at company level
            needs_review: false,
            created_at: new Date().toISOString(),
          },
          {
            onConflict: 'order_id,sequence,company_id',
            ignoreDuplicates: false,
          }
        );

      if (upsertError) {
        console.error(`Upsert error for allocation result: order_id=${result.order_id}, sequence=${result.sequence}, company_id=${result.company_id}`, upsertError);
        return { success: false, message: `Failed to save allocation result: ${upsertError.message}` };
      }
    }

    // Calculate and upsert company-level ROI and needs_review
    const companyUpsertData = Object.entries(companyAllocations).map(([companyId, { totalProfit, totalInvested }]) => {
      const roi = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0; // Store ROI as percentage
      const needsReview = roi < 30 && totalInvested > 0; // Threshold in percentage
      return {
        order_id: orderId,
        company_id: parseInt(companyId),
        max_investment: applications.find(app => app.company_id === parseInt(companyId))?.max_investment || 0,
        roi,
        needs_review: needsReview,
      };
    });

    console.log('Order company upsert payload:', companyUpsertData);
    const { error: companyInsertError } = await supabase
      .from('order_company')
      .upsert(companyUpsertData, { onConflict: 'order_id,company_id' });

    if (companyInsertError) {
      console.error('Insert order company error:', companyInsertError);
      return { success: false, message: 'Failed to save company allocation data' };
    }

    return { success: true, message: 'Allocation calculated successfully' };
  } catch (error) {
    console.error('Error in calculateOrderAllocation:', error);
    return { success: false, message: 'An unexpected error occurred' };
  }
}