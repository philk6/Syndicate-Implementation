'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@lib/supabase/admin'; // Use admin client via alias

// Define the server action
export async function calculateOrderAllocation(orderId: number): Promise<{ success: boolean; message: string }> {

  const allocationServiceUrl = process.env.ALLOCATION_SERVICE_URL || process.env.NEXT_PUBLIC_ALLOCATION_SERVICE_URL;

  if (!allocationServiceUrl) {
    console.error('ALLOCATION_SERVICE_URL environment variable is not set.');
    return { success: false, message: 'Allocation service URL is not configured.' };
  }

  if (!orderId) {
      return { success: false, message: 'Order ID is missing.' };
  }

  const url = `${allocationServiceUrl}/allocate/${orderId}`;
  const closedStatusId = 2; // Directly use the known ID for 'Closed'

  try {
    console.log(`Calling allocation service: GET ${url}`);
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            // Add any necessary authentication headers here if required by the service
        },
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Allocation service response:', result);

      // Update the order status to Closed using the known ID and the ADMIN client
      console.log(`Attempting to update order ${orderId} status to Closed (ID: ${closedStatusId}) using admin client`);
      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update({ order_status_id: closedStatusId })
        .eq('order_id', orderId);

      if (updateError) {
        console.error('Error updating order status:', updateError);
        return { success: false, message: `Allocation succeeded, but failed to update order status to Closed (ID: ${closedStatusId}). Error: ${updateError.message}` };
      } else {
         // If update seemed successful, immediately read back the value
         console.log(`Order ${orderId} status update reported success. Reading back status...`);
         const { data: updatedOrderData, error: readError } = await supabaseAdmin
            .from('orders')
            .select('order_status_id')
            .eq('order_id', orderId)
            .single(); // Use single() to get one row or null

         if (readError) {
            console.error(`Error reading back order status for order ${orderId}:`, readError);
            // Still report original success, but log the read error
         } else if (updatedOrderData) {
            console.log(`Read back status for order ${orderId}: ${updatedOrderData.order_status_id}`);
            if (updatedOrderData.order_status_id !== closedStatusId) {
               console.warn(`!!! Update reported success, but read-back status (${updatedOrderData.order_status_id}) doesn't match target (${closedStatusId}) !!!`);
               // Potentially return a modified success message indicating the discrepancy
               return { success: true, message: `Allocation triggered, update reported success, but status verification failed (read back ${updatedOrderData.order_status_id}).` };
            }
         } else {
             console.warn(`!!! Update reported success, but could not read back order ${orderId} !!!`);
             // Potentially return a modified success message
             return { success: true, message: `Allocation triggered, update reported success, but failed to re-read order for verification.` };
         }

         // Original success path continues if verification passes or isn't conclusive
         console.log(`Order ${orderId} status update verified (or verification inconclusive).`);
         revalidatePath(`/admin/orders/${orderId}`);
         return { success: true, message: 'Allocation calculation triggered successfully and order status updated to Closed.' };
      }

    } else {
      let errorDetail = `Request failed with status ${response.status}`;
      try {
          const errorJson = await response.json();
          errorDetail = errorJson.detail || errorDetail;
          console.error('Allocation service error response:', errorJson);
      } catch (e) {
          console.error('Could not parse error response JSON:', e);
          errorDetail = `${errorDetail}. Could not parse error response.`;
      }
      return { success: false, message: `Error: ${errorDetail}` };
    }
  } catch (error) {
    console.error('Error calling allocation service or updating status:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return { success: false, message: `Failed to trigger allocation or update status: ${errorMessage}` };
  }
} 