'use client';

import { useState, useEffect, useTransition, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import { CalendarIcon, Download, Trash2, Plus, Percent, Save, Edit, XCircle, CheckCircle, ListPlus, Search, TrendingUp, PackageSearch, DollarSign, Info } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { StatusPill } from '@/components/ui/status-pill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { calculateOrderAllocation } from './actions';
import { utils, write } from 'xlsx';
import { debounce } from 'lodash';

interface Order {
  order_id: number;
  leadtime: number;
  deadline: string;
  label_upload_deadline: string;
  order_statuses: { description: string };
  total_amount?: number;
  hide_allocations: boolean;
  is_public: boolean;
}

interface OrderProduct {
  sequence: number;
  order_id: number;
  asin: string;
  quantity: number;
  price: number;
  description?: string;
  cost_price: number;
  roi?: number;
  hide_price_and_quantity: boolean;
}

interface OrderStatus {
  order_status_id: number;
  description: string;
}

interface CompanyApplication {
  company_id: number;
  company_name: string;
  max_investment: number;
  ungated_count: number;
}

interface PreAssignment {
  assignment_id: number;
  order_id: number;
  sequence: number;
  company_id: number;
  company_name: string;
  quantity: number | null;
}

interface Company {
  company_id: number;
  name: string;
}

interface PreAssignmentQueryResult {
  assignment_id: number;
  order_id: number;
  sequence: number;
  company_id: number;
  company: { name: string } | null;
  quantity: number | null;
}

interface AllocationResult {
  id: number;
  order_id: number;
  sequence: number;
  company_id: number;
  quantity: number;
  created_at: string;
  company: { name: string } | null;
  order_products: { asin: string; price: number; cost_price: number; description: string | null } | null;
}

interface EditedAllocation {
  id: number;
  quantity: number;
}

interface Discount {
  order_id: number;
  sequence: number;
  company_id: number;
  company_name: string;
  asin: string;
  original_price: number;
  discounted_price: number | null;
}

interface OrderProductCompany {
  order_id: number;
  sequence: number;
  company_id: number;
  ungated: boolean;
  ungated_min_amount?: number | null;
  quantity: number;
  discounted_price?: number | null;
}

// Reusable DatePicker Component
function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const [date, setDate] = useState<Date | undefined>(new Date(value));

  const handleSelect = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) {
      // Format to YYYY-MM-DDTHH:MM, which is what datetime-local input expects
      const year = selectedDate.getFullYear();
      const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
      const day = selectedDate.getDate().toString().padStart(2, '0');
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}T${hours}:${minutes}`;
      onChange(formattedDate);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal bg-white/[0.02] text-neutral-200 border-white/[0.05] hover:bg-white/[0.05]',
            !date && 'text-neutral-500'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08]" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
          className="bg-transparent text-neutral-200"
        />
        {/* Basic time picker */}
        <div className="p-3 border-t border-white/[0.05]">
          <Input
            type="time"
            className="bg-white/[0.02] text-neutral-200 border-white/[0.05]"
            value={date ? `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}` : ''}
            onChange={(e) => {
              if (date) {
                const [hours, minutes] = e.target.value.split(':');
                const newDate = new Date(date);
                newDate.setHours(parseInt(hours));
                newDate.setMinutes(parseInt(minutes));
                handleSelect(newDate);
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function AdminOrderManagementPage() {
  const params = useParams();
  const orderId = parseInt(params.order_id as string);
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [preAssignments, setPreAssignments] = useState<PreAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyApplications, setCompanyApplications] = useState<CompanyApplication[]>([]);
  const [isPreAssignDialogOpen, setIsPreAssignDialogOpen] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [dialogCompanyId, setDialogCompanyId] = useState<string>('');
  const [dialogQuantity, setDialogQuantity] = useState<string>('');
  const [isDiscountDialogOpen, setIsDiscountDialogOpen] = useState(false);
  const [discountCompanyId, setDiscountCompanyId] = useState<string>('');
  const [discountSequence, setDiscountSequence] = useState<string>('');
  const [discountPrice, setDiscountPrice] = useState<string>('');
  const [discountPercentage, setDiscountPercentage] = useState<string>('');
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [allocationResults, setAllocationResults] = useState<AllocationResult[]>([]);
  const [editedAllocations, setEditedAllocations] = useState<EditedAllocation[]>([]);
  const [hideAll, setHideAll] = useState<boolean>(false);
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State for Edit Application Dialog
  const [isEditApplicationDialogOpen, setIsEditApplicationDialogOpen] = useState(false);
  const [editingApplication, setEditingApplication] = useState<CompanyApplication | null>(null);
  const [editMaxInvestment, setEditMaxInvestment] = useState<number | null>(null);
  const [editProductsUngatedStatus, setEditProductsUngatedStatus] = useState<Record<number, boolean>>({});
  const [editProductsUngatedMinAmounts, setEditProductsUngatedMinAmounts] = useState<Record<number, number | null>>({});
  const [editProductsData, setEditProductsData] = useState<OrderProduct[]>([]);

  // State for Delete Application Dialog
  const [isDeleteApplicationDialogOpen, setIsDeleteApplicationDialogOpen] = useState(false);
  const [deletingApplication, setDeletingApplication] = useState<CompanyApplication | null>(null);

  // State for Whitelist Management
  const [isWhitelistDialogOpen, setIsWhitelistDialogOpen] = useState(false);
  const [whitelistedCompanies, setWhitelistedCompanies] = useState<Company[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [whitelistSearchTerm, setWhitelistSearchTerm] = useState<string>('');

  // State for new dialogs
  const [isCompanyAllocationSummaryDialogOpen, setIsCompanyAllocationSummaryDialogOpen] = useState(false);
  const [isUnallocatedProductsDialogOpen, setIsUnallocatedProductsDialogOpen] = useState(false);

  // State for Add New Allocation Dialog
  const [isAddAllocationDialogOpen, setIsAddAllocationDialogOpen] = useState(false);
  const [newAllocationSequence, setNewAllocationSequence] = useState<string>('');
  const [newAllocationCompanyId, setNewAllocationCompanyId] = useState<string>('');
  const [newAllocationQuantity, setNewAllocationQuantity] = useState<string>('');


  const fetchCompanyApplications = async (currentOrderId: number) => {
    interface CompanyApplicationResult {
      company_id: number;
      company: { name: string } | null;
      max_investment: number;
    }

    const { data: applicationData, error: applicationError } = await supabase
      .from('order_company')
      .select('company_id, company(name), max_investment')
      .eq('order_id', currentOrderId) as { data: CompanyApplicationResult[] | null, error: PostgrestError | null };

    if (applicationError) {
      console.error('Error fetching company applications:', applicationError);
      setCompanyApplications([]);
    } else if (applicationData && applicationData.length > 0) {
      const companyApps = await Promise.all(
        applicationData.map(async (app: CompanyApplicationResult) => {
          const { data: ungatedData, error: ungatedError } = await supabase
            .from('order_products_company')
            .select('sequence')
            .eq('order_id', currentOrderId)
            .eq('company_id', app.company_id)
            .eq('ungated', true);

          if (ungatedError) {
            console.error(`Error fetching ungated products for company ${app.company_id}:`, ungatedError);
            return {
              company_id: app.company_id,
              company_name: app.company?.name || 'Unknown',
              max_investment: app.max_investment,
              ungated_count: 0,
            };
          }

          return {
            company_id: app.company_id,
            company_name: app.company?.name || 'Unknown',
            max_investment: app.max_investment,
            ungated_count: ungatedData?.length || 0,
          };
        })
      );

      const sortedApps = companyApps.sort((a, b) => b.max_investment - a.max_investment);
      setCompanyApplications(sortedApps);
    } else {
      setCompanyApplications([]);
    }
  };

  const fetchWhitelistedCompanies = useCallback(async (currentOrderId: number) => {
    const { data, error } = await supabase
      .from('order_whitelists')
      .select('company_id, company(name)')
      .eq('order_id', currentOrderId);

    if (error) {
      console.error('Error fetching whitelisted companies:', error);
      setWhitelistedCompanies([]);
    } else {
      setWhitelistedCompanies(data.map(item => ({
        company_id: item.company_id,
        name: Array.isArray(item.company)
          ? (item.company[0] as { name?: string })?.name || 'Unknown'
          : (item.company as { name?: string })?.name || 'Unknown'
      })));
    }
  }, []);


  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || user?.role !== 'admin') {
        router.push('/login');
        return;
      }

      async function fetchData() {
        setLoading(true);

        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description), hide_allocations, is_public')
          .eq('order_id', orderId)
          .single() as { data: Order | null, error: PostgrestError | null };

        if (orderError) {
          console.error('Error fetching order:', orderError);
          setLoading(false);
          return;
        }

        const { data: productData, error: productError } = await supabase
          .from('order_products')
          .select('sequence, order_id, asin, quantity, price, cost_price, description, roi, hide_price_and_quantity')
          .eq('order_id', orderId);

        if (productError) {
          console.error('Error fetching order products:', productError);
        }

        const { data: statusData, error: statusError } = await supabase
          .from('order_statuses')
          .select('order_status_id, description');

        if (statusError) {
          console.error('Error fetching statuses:', statusError);
        }

        const { data: companyData, error: companyError } = await supabase
          .from('company')
          .select('company_id, name');

        if (companyError) {
          console.error('Error fetching companies:', companyError);
        }
        setAllCompanies(companyData || []);

        const { data: preAssignmentData, error: preAssignmentError } = await supabase
          .from('order_pre_assignments')
          .select('assignment_id, order_id, sequence, company_id, company(name), quantity')
          .eq('order_id', orderId) as { data: PreAssignmentQueryResult[] | null, error: PostgrestError | null };

        if (preAssignmentError) {
          console.error('Error fetching pre-assignments:', preAssignmentError);
        }

        await fetchCompanyApplications(orderId);
        await fetchWhitelistedCompanies(orderId);

        const { data: allocationData, error: allocationError } = await supabase
          .from('allocation_results')
          .select('*, company(name), order_products(asin, price, cost_price, description)')
          .eq('order_id', orderId);

        if (allocationError) {
          console.error('Error fetching allocation results:', allocationError);
        }

        const { data: discountData, error: discountError } = await supabase
          .from('order_products_company')
          .select(`
            order_id,
            sequence,
            company_id,
            company:company_id(name),
            discounted_price,
            order_products!order_products_company_order_id_sequence_fkey(asin, price)
          `)
          .eq('order_id', orderId)
          .not('discounted_price', 'is', null);

        if (discountError) {
          console.error('Error fetching discounts:', discountError);
        } else {
          setDiscounts(
            discountData?.map(d => {
              const company = Array.isArray(d.company) ? d.company[0] : d.company;
              const orderProductsData = Array.isArray(d.order_products) ? d.order_products[0] : d.order_products;

              return {
                order_id: d.order_id,
                sequence: d.sequence,
                company_id: d.company_id,
                company_name: company?.name || 'Unknown',
                asin: orderProductsData?.asin || 'Unknown',
                original_price: orderProductsData?.price || 0,
                discounted_price: d.discounted_price,
              };
            }) || []
          );
        }

        setOrder(orderData);
        setProducts(productData || []);
        setStatuses(statusData || []);
        setCompanies(companyData || []);
        setPreAssignments(
          preAssignmentData?.map(pa => ({
            ...pa,
            company_id: pa.company_id,
            company_name: pa.company?.name ?? 'Unknown Company',
          })) || []
        );
        setAllocationResults(allocationData || []);
        setEditedAllocations(
          (allocationData || []).map(a => ({
            id: a.id,
            quantity: a.quantity,
          }))
        );
        setHideAll(productData?.every(p => p.hide_price_and_quantity) || false);
        setLoading(false);
      }

      fetchData();
    }
  }, [orderId, isAuthenticated, authLoading, router, user?.role, fetchWhitelistedCompanies]);

  const handleStatusChange = async (newStatusId: string) => {
    const newStatusIdInt = parseInt(newStatusId);
    const oldStatusId = currentStatusId;

    if (!oldStatusId) {
      setFeedbackMessage({ type: 'error', text: 'Current status not found.' });
      return;
    }

    try {
      // First, handle any credit-related transitions
      const { error: transitionError } = await supabase
        .rpc('handle_order_status_transition', {
          p_order_id: orderId,
          p_new_status_id: newStatusIdInt,
          p_old_status_id: oldStatusId
        });

      if (transitionError) {
        console.error('Error handling status transition:', transitionError);
        setFeedbackMessage({
          type: 'error',
          text: `Failed to process credit transactions: ${transitionError.message}`
        });
        return;
      }

      // Then update the order status
      const { error: updateError } = await supabase
        .from('orders')
        .update({ order_status_id: newStatusIdInt })
        .eq('order_id', orderId);

      if (updateError) {
        console.error('Error updating status:', updateError);
        setFeedbackMessage({ type: 'error', text: 'Failed to update status.' });

        // If status update fails, we might need to reverse the credit transactions
        // This would require another function or manual intervention
      } else {
        setOrder(prev => prev ? {
          ...prev,
          order_statuses: statuses.find(s => s.order_status_id === newStatusIdInt)!
        } : null);

        // Show appropriate message based on the transition
        const newStatus = statuses.find(s => s.order_status_id === newStatusIdInt);
        const oldStatus = statuses.find(s => s.order_status_id === oldStatusId);

        if (newStatus?.description.toLowerCase() === 'closed') {
          setFeedbackMessage({
            type: 'success',
            text: 'Order closed successfully. Credit transactions have been processed.'
          });
        } else if (oldStatus?.description.toLowerCase() === 'closed') {
          setFeedbackMessage({
            type: 'success',
            text: 'Order reopened successfully. Credit holds have been reinstated.'
          });
        } else {
          setFeedbackMessage({ type: 'success', text: 'Status updated successfully.' });
        }

        // Refresh company applications to show updated held/allocated amounts
        await fetchCompanyApplications(orderId);
      }
    } catch (err) {
      console.error('Unexpected error during status change:', err);
      setFeedbackMessage({
        type: 'error',
        text: 'An unexpected error occurred while changing the order status.'
      });
    }
  };

  const handleHideAllocationsToggle = async (checked: boolean) => {
    const { error } = await supabase
      .from('orders')
      .update({ hide_allocations: checked })
      .eq('order_id', orderId);

    if (error) {
      console.error('Error updating hide_allocations:', error);
      setFeedbackMessage({ type: 'error', text: 'Failed to update allocations visibility.' });
    } else {
      setOrder(prev => prev ? { ...prev, hide_allocations: checked } : null);
      setFeedbackMessage({ type: 'success', text: `Allocations ${checked ? 'hidden' : 'visible'} for users.` });
    }
  };

  const handleAccessibilityChange = async (value: string) => {
    const isPublic = value === 'public';
    const { error } = await supabase
      .from('orders')
      .update({ is_public: isPublic })
      .eq('order_id', orderId);

    if (error) {
      console.error('Error updating accessibility:', error);
      setFeedbackMessage({ type: 'error', text: 'Failed to update order accessibility.' });
    } else {
      setOrder(prev => prev ? { ...prev, is_public: isPublic } : null);
      setFeedbackMessage({ type: 'success', text: `Order accessibility set to ${isPublic ? 'Public' : 'Private'}.` });
    }
  };

  const updateProduct = useCallback(
    async (sequence: number, field: keyof OrderProduct | 'roi' | 'hide_price_and_quantity', value: string | number | boolean) => {
      const updatedProduct = products.find(p => p.sequence === sequence);
      if (!updatedProduct) return;

      const updatedValue = typeof value === 'string' && (field === 'price' || field === 'quantity' || field === 'cost_price' || field === 'roi') ? parseFloat(value) : value;
      const { error } = await supabase
        .from('order_products')
        .update({ [field]: updatedValue })
        .eq('order_id', orderId)
        .eq('sequence', sequence);

      if (error) {
        console.error('Error updating product:', error);
      } else {
        setProducts(prev => prev.map(p => p.sequence === sequence ? { ...p, [field]: updatedValue } : p));
        if (field === 'hide_price_and_quantity') {
          setHideAll(products.every(p => p.sequence === sequence ? updatedValue : p.hide_price_and_quantity));
        }
      }
    },
    [products, orderId, setProducts, setHideAll]
  );

  const debouncedProductUpdate = useCallback(
    (sequence: number, field: keyof OrderProduct | 'roi' | 'hide_price_and_quantity', value: string | number | boolean) => {
      const debounceFn = debounce((seq: number, fld: keyof OrderProduct | 'roi' | 'hide_price_and_quantity', val: string | number | boolean) => {
        updateProduct(seq, fld, val);
      }, 300);
      debounceFn(sequence, field, value);
    },
    [updateProduct]
  );

  const handleProductUpdate = (sequence: number, field: keyof OrderProduct | 'roi' | 'hide_price_and_quantity', value: string | number | boolean) => {
    const updatedValue = typeof value === 'string' && (field === 'price' || field === 'quantity' || field === 'cost_price' || field === 'roi') ? parseFloat(value) : value;
    setProducts(prev => prev.map(p => p.sequence === sequence ? { ...p, [field]: updatedValue } : p));

    if (field === 'hide_price_and_quantity') {
      setHideAll(products.every(p => p.sequence === sequence ? updatedValue : p.hide_price_and_quantity));
    }

    debouncedProductUpdate(sequence, field, value);
  };

  const handleHideAllToggle = async (checked: boolean) => {
    setHideAll(checked);
    setProducts(prev => prev.map(p => ({ ...p, hide_price_and_quantity: checked })));

    const { error } = await supabase
      .from('order_products')
      .update({ hide_price_and_quantity: checked })
      .eq('order_id', orderId);

    if (error) {
      console.error('Error updating hide_price_and_quantity for all products:', error);
      setProducts(prev => prev.map(p => ({ ...p, hide_price_and_quantity: !checked }))); // Revert on error
      setHideAll(!checked); // Revert on error
      setFeedbackMessage({ type: 'error', text: 'Failed to update price and quantity visibility.' });
    } else {
      setFeedbackMessage({ type: 'success', text: `Price and quantity ${checked ? 'hidden' : 'visible'}.` });
    }
  };

  const handleProductRemove = async (sequence: number) => {
    try {
      // Attempt to delete related records first to maintain referential integrity
      const { error: opcError } = await supabase
        .from('order_products_company')
        .delete()
        .eq('order_id', orderId)
        .eq('sequence', sequence);
      if (opcError) {
        // If the error is due to foreign key constraint, it might mean no records existed, which is fine.
        // If it's another error, then it's problematic.
        if (opcError.code !== '23503' && opcError.code !== 'PGRST204') { // PGRST204: No Content (means nothing to delete)
          throw new Error(`Failed to delete order_products_company: ${opcError.message}`);
        }
      }

      const { error: preAssignmentsError } = await supabase
        .from('order_pre_assignments')
        .delete()
        .eq('order_id', orderId)
        .eq('sequence', sequence);
      if (preAssignmentsError && preAssignmentsError.code !== 'PGRST204') {
        throw new Error(`Failed to delete order_pre_assignments: ${preAssignmentsError.message}`);
      }

      const { error: allocationError } = await supabase
        .from('allocation_results')
        .delete()
        .eq('order_id', orderId)
        .eq('sequence', sequence);
      if (allocationError && allocationError.code !== 'PGRST204') {
        throw new Error(`Failed to delete allocation_results: ${allocationError.message}`);
      }

      // Finally, delete the product itself
      const { error: productError } = await supabase
        .from('order_products')
        .delete()
        .eq('order_id', orderId)
        .eq('sequence', sequence);

      if (productError) {
        throw new Error(`Failed to delete product: ${productError.message}`);
      }

      // Update local state
      setProducts(prev => prev.filter(p => p.sequence !== sequence));
      setPreAssignments(prev => prev.filter(pa => pa.sequence !== sequence));
      setDiscounts(prev => prev.filter(d => d.sequence !== sequence));
      setAllocationResults(prev => prev.filter(a => a.sequence !== sequence));
      setEditedAllocations(prev => prev.filter(a => !allocationResults.find(ar => ar.id === a.id && ar.sequence === sequence)));
      setHideAll(products.filter(p => p.sequence !== sequence).every(p => p.hide_price_and_quantity));
      setFeedbackMessage({ type: 'success', text: 'Product removed successfully.' });

    } catch (err: unknown) {
      console.error('Error removing product and its dependencies:', err);
      setFeedbackMessage({ type: 'error', text: (err instanceof Error) ? err.message : 'An unexpected error occurred during product removal.' });
    }
  };

  const handleProductAdd = async () => {
    const newSequence = products.length > 0 ? Math.max(...products.map(p => p.sequence)) + 1 : 1;
    const newProduct = {
      order_id: orderId,
      sequence: newSequence,
      asin: 'NEW-ASIN',
      quantity: 1,
      price: 0,
      description: 'New Product',
      cost_price: 0,
      hide_price_and_quantity: hideAll, // Apply current hideAll state
      roi: 0,
    };

    const { error } = await supabase
      .from('order_products')
      .insert(newProduct);

    if (error) {
      console.error('Error adding product:', error);
      setFeedbackMessage({ type: 'error', text: 'Failed to add product.' });
    } else {
      setProducts(prev => [...prev, newProduct]);
      setFeedbackMessage({ type: 'success', text: 'Product added successfully.' });
    }
  };

  const updateOrder = useCallback(
    async (field: 'leadtime' | 'deadline' | 'label_upload_deadline', value: string | number) => {
      const updatedValue = field === 'leadtime' ? parseInt(value as string) : value;
      const { error } = await supabase
        .from('orders')
        .update({ [field]: updatedValue })
        .eq('order_id', orderId);

      if (error) {
        console.error('Error updating order:', error);
        setFeedbackMessage({ type: 'error', text: 'Failed to update order.' });
      } else {
        setOrder(prev => prev ? { ...prev, [field]: updatedValue } : null);
        setFeedbackMessage({ type: 'success', text: `${field} updated successfully.` });
      }
    },
    [orderId, setOrder]
  );

  const debouncedOrderUpdate = useCallback(
    (field: 'leadtime' | 'deadline' | 'label_upload_deadline', value: string | number) => {
      const debounceFn = debounce((fld: 'leadtime' | 'deadline' | 'label_upload_deadline', val: string | number) => {
        updateOrder(fld, val);
      }, 300);
      debounceFn(field, value);
    },
    [updateOrder]
  );

  const handleOrderUpdate = (field: 'leadtime' | 'deadline' | 'label_upload_deadline', value: string | number) => {
    const updatedValue = field === 'leadtime' ? parseInt(value as string) : value;
    setOrder(prev => prev ? { ...prev, [field]: updatedValue } : null);
    debouncedOrderUpdate(field, value);
  };

  const handlePreAssign = async () => {
    if (!selectedSequence || !dialogCompanyId) {
      setFeedbackMessage({ type: 'error', text: 'Please select a company.' });
      return;
    }

    const company_id = parseInt(dialogCompanyId);
    const qty = dialogQuantity ? parseInt(dialogQuantity) : null;
    const product = products.find(p => p.sequence === selectedSequence);
    if (!product) return;

    const assignedQuantities = preAssignments
      .filter(pa => pa.sequence === selectedSequence && pa.quantity !== null)
      .reduce((sum, pa) => sum + (pa.quantity || 0), 0);
    const newTotal = assignedQuantities + (qty || 0);

    if (newTotal > product.quantity) {
      setFeedbackMessage({ type: 'error', text: `Total pre-assigned quantity (${newTotal}) exceeds available amount (${product.quantity}).` });
      return;
    }

    const { data, error } = await supabase
      .from('order_pre_assignments')
      .insert({
        order_id: orderId,
        sequence: selectedSequence,
        company_id,
        quantity: qty,
      })
      .select('assignment_id, order_id, sequence, company_id, company(name), quantity')
      .single() as { data: PreAssignmentQueryResult | null, error: PostgrestError | null };

    if (error) {
      console.error('Error adding pre-assignment:', error);
      setFeedbackMessage({ type: 'error', text: 'Failed to add pre-assignment.' });
    } else if (data) {
      setPreAssignments(prev => [
        ...prev,
        {
          assignment_id: data.assignment_id,
          order_id: data.order_id,
          sequence: data.sequence,
          company_id: data.company_id,
          quantity: data.quantity,
          company_name: data.company?.name ?? 'Unknown Company',
        }
      ]);
      setIsPreAssignDialogOpen(false);
      setDialogCompanyId('');
      setDialogQuantity('');
      setSelectedSequence(null);
      setFeedbackMessage({ type: 'success', text: 'Pre-assignment added successfully.' });
    }
  };

  const handlePreAssignRemove = async (assignmentId: number) => {
    const { error } = await supabase
      .from('order_pre_assignments')
      .delete()
      .eq('assignment_id', assignmentId);

    if (error) {
      console.error('Error removing pre-assignment:', error);
      setFeedbackMessage({ type: 'error', text: 'Failed to remove pre-assignment.' });
    } else {
      setPreAssignments(prev => prev.filter(pa => pa.assignment_id !== assignmentId));
      setFeedbackMessage({ type: 'success', text: 'Pre-assignment removed successfully.' });
    }
  };

  const handleCalculateAllocation = () => {
    setFeedbackMessage(null);
    startTransition(async () => {
      const result = await calculateOrderAllocation(orderId);
      setFeedbackMessage({ type: result.success ? 'success' : 'error', text: result.message });

      if (result.success) {
        // Refetch allocation results after calculation
        const { data: allocationData } = await supabase
          .from('allocation_results')
          .select('*, company(name), order_products(asin, price, cost_price, description)')
          .eq('order_id', orderId);
        setAllocationResults(allocationData || []);
        setEditedAllocations(
          (allocationData || []).map(a => ({
            id: a.id,
            quantity: a.quantity,
          }))
        );
        router.refresh(); // Consider if this is still needed or if state updates are sufficient
      }
    });
  };

  const handleDownloadAllocationResults = () => {
    const exportData = allocationResults.map(result => ({
      ASIN: result.order_products?.asin || 'N/A',
      Company: result.company?.name || 'Unknown',
      Quantity: result.quantity,
      Price: result.order_products?.price ?? 'N/A',
      'Cost Price': result.order_products?.cost_price ?? 'N/A',
      Description: result.order_products?.description || 'N/A',
    }));

    const ws = utils.json_to_sheet(exportData, {
      header: ['ASIN', 'Company', 'Quantity', 'Price', 'Cost Price', 'Description'],
    });

    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Allocation Results');

    const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Order_${orderId}_Allocation_Results.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const openDiscountDialog = (sequence?: number, companyId?: number, discountedPrice?: number | null) => {
    setDiscountSequence(sequence?.toString() || '');
    setDiscountCompanyId(companyId?.toString() || '');
    setDiscountPrice(discountedPrice?.toString() || '');
    setDiscountPercentage('');
    setIsDiscountDialogOpen(true);
  };

  const handleDiscountSave = async () => {
    if (!discountCompanyId || !discountSequence) {
      setFeedbackMessage({ type: 'error', text: 'Please select a company and product.' });
      return;
    }

    const company_id = parseInt(discountCompanyId);
    const sequence = parseInt(discountSequence);
    const discounted_price = parseFloat(discountPrice) || null;

    if (discounted_price !== null) {
      const product = products.find(p => p.sequence === sequence);
      if (!product) {
        setFeedbackMessage({ type: 'error', text: 'Invalid product selected.' });
        return;
      }
      if (discounted_price >= product.price) {
        setFeedbackMessage({ type: 'error', text: 'Discounted price must be less than the original price.' });
        return;
      }
      if (discounted_price <= 0) {
        setFeedbackMessage({ type: 'error', text: 'Discounted price must be greater than zero.' });
        return;
      }
    }

    // Check if an entry exists in order_products_company for this order, sequence, and company
    const { data: existingOpc, error: fetchOpcError } = await supabase
      .from('order_products_company')
      .select('quantity, ungated, ungated_min_amount') // Select existing fields
      .eq('order_id', orderId)
      .eq('sequence', sequence)
      .eq('company_id', company_id)
      .maybeSingle();

    if (fetchOpcError && fetchOpcError.code !== 'PGRST116') { // PGRST116: No rows found, which is fine for an upsert
      console.error('Error fetching existing order_products_company:', fetchOpcError);
      setFeedbackMessage({ type: 'error', text: 'Failed to check existing discount data.' });
      return;
    }

    const upsertData: OrderProductCompany = {
      order_id: orderId,
      sequence,
      company_id,
      discounted_price,
      // Preserve existing quantity and ungated status if they exist, otherwise use defaults
      quantity: existingOpc?.quantity ?? 0,
      ungated: existingOpc?.ungated ?? false,
    };

    if (existingOpc?.ungated_min_amount !== undefined) { // Only include if it was already set
      upsertData.ungated_min_amount = existingOpc.ungated_min_amount;
    }


    const { error: opcError } = await supabase
      .from('order_products_company')
      .upsert(upsertData, {
        onConflict: 'order_id,sequence,company_id',
      });

    if (opcError) {
      console.error('Error saving discount:', opcError);
      setFeedbackMessage({ type: 'error', text: 'Failed to save discount.' });
      return;
    }

    // Update has_discounts on order_company table
    const { error: ocError } = await supabase
      .from('order_company')
      .update({ has_discounts: discounted_price !== null }) // This logic might need refinement if multiple discounts per company
      .eq('order_id', orderId)
      .eq('company_id', company_id);

    if (ocError) {
      console.error('Error updating has_discounts:', ocError);
      // This might not be a critical failure for the user, so maybe just log it or a softer feedback
    }

    const product = products.find(p => p.sequence === sequence);
    const company = companies.find(c => c.company_id === company_id);

    setDiscounts(prev => {
      const existing = prev.find(d => d.sequence === sequence && d.company_id === company_id);
      if (existing) {
        return prev.map(d =>
          d.sequence === sequence && d.company_id === company_id
            ? { ...d, discounted_price, original_price: product?.price || 0 }
            : d
        );
      }
      return [
        ...prev,
        {
          order_id: orderId,
          sequence,
          company_id,
          company_name: company?.name || 'Unknown',
          asin: product?.asin || 'Unknown',
          original_price: product?.price || 0,
          discounted_price,
        },
      ];
    });

    setIsDiscountDialogOpen(false);
    setDiscountCompanyId('');
    setDiscountSequence('');
    setDiscountPrice('');
    setDiscountPercentage('');
    setFeedbackMessage({ type: 'success', text: 'Discount saved successfully.' });
  };

  const handleDiscountPercentageChange = (value: string) => {
    setDiscountPercentage(value);
    const product = products.find(p => p.sequence === parseInt(discountSequence));
    if (product && value) {
      const percentage = parseFloat(value);
      const discountedPrice = product.price * (1 - percentage / 100);
      setDiscountPrice(discountedPrice.toFixed(2));
    } else {
      setDiscountPrice('');
    }
  };

  const handleDiscountDelete = async (sequence: number, company_id: number) => {
    const { error: opcError } = await supabase
      .from('order_products_company')
      .update({ discounted_price: null }) // Set discounted_price to null instead of deleting the row
      .eq('order_id', orderId)
      .eq('sequence', sequence)
      .eq('company_id', company_id);

    if (opcError) {
      console.error('Error deleting discount:', opcError);
      setFeedbackMessage({ type: 'error', text: 'Failed to delete discount.' });
      return;
    }

    // Check if this company still has other discounts for this order
    const { data: remainingDiscounts } = await supabase
      .from('order_products_company')
      .select('discounted_price')
      .eq('order_id', orderId)
      .eq('company_id', company_id)
      .not('discounted_price', 'is', null);

    const has_discounts = remainingDiscounts && remainingDiscounts.length > 0;

    const { error: ocError } = await supabase
      .from('order_company')
      .update({ has_discounts })
      .eq('order_id', orderId)
      .eq('company_id', company_id);

    if (ocError) {
      console.error('Error updating has_discounts:', ocError);
      // Non-critical, proceed with UI update
    }

    setDiscounts(prev => prev.filter(d => !(d.sequence === sequence && d.company_id === company_id)));
    setFeedbackMessage({ type: 'success', text: 'Discount deleted successfully.' });
  };

  const handleAllocationChange = (id: number, field: keyof EditedAllocation, value: number) => {
    setEditedAllocations(prev =>
      prev.map(a =>
        a.id === id
          ? { ...a, [field]: value }
          : a
      )
    );
  };

  const handleAllocationSave = async (id: number) => {
    const allocation = editedAllocations.find(a => a.id === id);
    if (!allocation) return;

    const result = allocationResults.find(a => a.id === id);
    const product = products.find(p => p.sequence === result?.sequence);
    if (!product || !result) return;

    const totalAllocatedForThisProductExcludingCurrent = allocationResults
      .filter(ar => ar.sequence === result.sequence && ar.id !== id)
      .reduce((sum, ar) => sum + ar.quantity, 0);

    const newTotalForProduct = totalAllocatedForThisProductExcludingCurrent + allocation.quantity;


    if (newTotalForProduct > product.quantity) {
      setFeedbackMessage({
        type: 'error',
        text: `Total allocated quantity (${newTotalForProduct}) for ASIN ${product.asin} exceeds available quantity (${product.quantity}).`,
      });
      return;
    }

    const { error } = await supabase
      .from('allocation_results')
      .update({
        quantity: allocation.quantity,
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating allocation:', error);
      setFeedbackMessage({ type: 'error', text: 'Failed to update allocation.' });
    } else {
      setAllocationResults(prev =>
        prev.map(a =>
          a.id === id
            ? { ...a, quantity: allocation.quantity }
            : a
        )
      );
      setFeedbackMessage({ type: 'success', text: 'Allocation updated successfully.' });
    }
  };

  const handleAllocationDelete = async (id: number) => {
    const { error } = await supabase
      .from('allocation_results')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting allocation:', error);
      setFeedbackMessage({ type: 'error', text: 'Failed to delete allocation.' });
    } else {
      setAllocationResults(prev => prev.filter(a => a.id !== id));
      setEditedAllocations(prev => prev.filter(a => a.id !== id));
      setFeedbackMessage({ type: 'success', text: 'Allocation deleted successfully.' });
    }
  };

  const handleEditApplicationClick = async (application: CompanyApplication) => {
    setEditingApplication(application);
    setEditMaxInvestment(application.max_investment);

    const { data: ungatedProductsData, error } = await supabase
      .from('order_products_company')
      .select('sequence, ungated, ungated_min_amount')
      .eq('order_id', orderId)
      .eq('company_id', application.company_id);

    if (error) {
      console.error('Error fetching ungated products for edit:', error);
      setFeedbackMessage({ type: 'error', text: 'Failed to load product ungated data.' });
      return;
    }

    const ungatedStatusMap: Record<number, boolean> = {};
    const ungatedMinAmountsMap: Record<number, number | null> = {};

    ungatedProductsData?.forEach(item => {
      ungatedStatusMap[item.sequence] = item.ungated;
      ungatedMinAmountsMap[item.sequence] = item.ungated_min_amount;
    });

    setEditProductsUngatedStatus(ungatedStatusMap);
    setEditProductsUngatedMinAmounts(ungatedMinAmountsMap);
    setEditProductsData(products); // Use current products list for the dialog
    setIsEditApplicationDialogOpen(true);
  };

  const handleEditUngatedChange = (sequence: number, checked: boolean) => {
    setEditProductsUngatedStatus(prev => ({ ...prev, [sequence]: checked }));
    if (!checked) {
      setEditProductsUngatedMinAmounts(prev => ({ ...prev, [sequence]: null }));
    }
  };

  const handleEditMinAmountChange = (sequence: number, value: string) => {
    const newMinAmount = value ? parseInt(value) : null;
    setEditProductsUngatedMinAmounts(prev => ({ ...prev, [sequence]: newMinAmount }));
  };

  const handleSaveApplicationChanges = async () => {
    if (!editingApplication) return;
    setFeedbackMessage(null);
    try {
      const { error: maxInvestmentError } = await supabase
        .from('order_company')
        .update({ max_investment: editMaxInvestment })
        .eq('order_id', orderId)
        .eq('company_id', editingApplication.company_id);

      if (maxInvestmentError) {
        throw new Error('Failed to update max investment: ' + maxInvestmentError.message);
      }

      const productCompanyUpdates: OrderProductCompany[] = products.map(product => ({
        order_id: orderId,
        sequence: product.sequence,
        company_id: editingApplication.company_id,
        ungated: editProductsUngatedStatus[product.sequence] || false,
        ungated_min_amount: editProductsUngatedStatus[product.sequence] ? editProductsUngatedMinAmounts[product.sequence] : null,
        quantity: product.quantity, // This might need to be fetched or handled differently if it can change
      }));

      const { error: productsCompanyError } = await supabase
        .from('order_products_company')
        .upsert(productCompanyUpdates, { onConflict: 'order_id, sequence, company_id' });

      if (productsCompanyError) {
        throw new Error('Failed to update product ungated status: ' + productsCompanyError.message);
      }

      setFeedbackMessage({ type: 'success', text: 'Application updated successfully!' });
      setIsEditApplicationDialogOpen(false);
      await fetchCompanyApplications(orderId); // Refresh company applications list
    } catch (err: unknown) {
      console.error('Error saving application changes:', err);
      setFeedbackMessage({ type: 'error', text: err instanceof Error ? err.message : 'An unexpected error occurred.' });
    }
  };

  const handleDeleteApplicationClick = (application: CompanyApplication) => {
    setDeletingApplication(application);
    setIsDeleteApplicationDialogOpen(true);
  };

  const handleConfirmDeleteApplication = async () => {
    if (!deletingApplication) return;
    setFeedbackMessage(null);
    try {
      // Delete from order_products_company first
      const { error: opcError } = await supabase
        .from('order_products_company')
        .delete()
        .eq('order_id', orderId)
        .eq('company_id', deletingApplication.company_id);

      if (opcError && opcError.code !== 'PGRST204') { // PGRST204 means no rows were deleted, which is fine
        throw new Error('Failed to delete product ungated data: ' + opcError.message);
      }

      // Then delete from order_company
      const { error: ocError } = await supabase
        .from('order_company')
        .delete()
        .eq('order_id', orderId)
        .eq('company_id', deletingApplication.company_id);

      if (ocError) {
        throw new Error('Failed to delete company application: ' + ocError.message);
      }

      setFeedbackMessage({ type: 'success', text: 'Application deleted successfully!' });
      setIsDeleteApplicationDialogOpen(false);
      await fetchCompanyApplications(orderId); // Refresh the list
    } catch (err: unknown) {
      console.error('Error deleting application:', err);
      setFeedbackMessage({ type: 'error', text: err instanceof Error ? err.message : 'An unexpected error occurred during deletion.' });
    }
  };

  const handleAddCompanyToWhitelist = async (companyId: number) => {
    setFeedbackMessage(null);
    try {
      const { error } = await supabase
        .from('order_whitelists')
        .insert({ order_id: orderId, company_id: companyId });

      if (error) {
        throw new Error('Failed to add company to whitelist: ' + error.message);
      }
      setFeedbackMessage({ type: 'success', text: 'Company added to whitelist.' });
      fetchWhitelistedCompanies(orderId); // Refresh the list
    } catch (err: unknown) {
      console.error('Error adding to whitelist:', err);
      setFeedbackMessage({ type: 'error', text: err instanceof Error ? err.message : 'An unexpected error occurred.' });
    }
  };

  const handleRemoveCompanyFromWhitelist = async (companyId: number) => {
    setFeedbackMessage(null);
    try {
      const { error } = await supabase
        .from('order_whitelists')
        .delete()
        .eq('order_id', orderId)
        .eq('company_id', companyId);

      if (error) {
        throw new Error('Failed to remove company from whitelist: ' + error.message);
      }
      setFeedbackMessage({ type: 'success', text: 'Company removed from whitelist.' });
      fetchWhitelistedCompanies(orderId); // Refresh the list
    } catch (err: unknown) {
      console.error('Error removing from whitelist:', err);
      setFeedbackMessage({ type: 'error', text: err instanceof Error ? err.message : 'An unexpected error occurred.' });
    }
  };

  const filteredAvailableCompanies = allCompanies.filter(company =>
    !whitelistedCompanies.some(wc => wc.company_id === company.company_id) &&
    company.name.toLowerCase().includes(whitelistSearchTerm.toLowerCase())
  );

  const companyAllocationSummary = useMemo(() => {
    return companyApplications.map(app => {
      const allocatedToCompany = allocationResults.filter(ar => ar.company_id === app.company_id);
      const totalAllocatedValue = allocatedToCompany.reduce((sum, ar) => {
        // Use the price from the allocation_results's joined order_products data
        const productPrice = ar.order_products?.price || 0;
        return sum + (ar.quantity * productPrice);
      }, 0);
      return {
        ...app,
        totalAllocatedValue,
      };
    });
  }, [companyApplications, allocationResults]);

  const unallocatedProductsSummary = useMemo(() => {
    return products.map(product => {
      const totalAllocatedForProduct = allocationResults
        .filter(ar => ar.sequence === product.sequence)
        .reduce((sum, ar) => sum + ar.quantity, 0);
      const unallocatedQuantity = product.quantity - totalAllocatedForProduct;
      return {
        ...product,
        totalAllocatedForProduct,
        unallocatedQuantity,
      };
    }).filter(p => p.unallocatedQuantity > 0);
  }, [products, allocationResults]);

  // For "Add New Allocation" Dialog
  const availableProductsForNewAllocation = useMemo(() => {
    return products.filter(product => {
      const totalAllocatedForProduct = allocationResults
        .filter(ar => ar.sequence === product.sequence)
        .reduce((sum, ar) => sum + ar.quantity, 0);
      return product.quantity - totalAllocatedForProduct > 0;
    });
  }, [products, allocationResults]);

  const handleAddNewAllocationSave = async () => {
    if (!newAllocationSequence || !newAllocationCompanyId || !newAllocationQuantity) {
      setFeedbackMessage({ type: 'error', text: 'Please select ASIN, Company, and enter Quantity.' });
      return;
    }

    const sequence = parseInt(newAllocationSequence);
    const company_id = parseInt(newAllocationCompanyId);
    const quantity = parseInt(newAllocationQuantity);

    if (isNaN(sequence) || isNaN(company_id) || isNaN(quantity) || quantity <= 0) {
      setFeedbackMessage({ type: 'error', text: 'Invalid input. Quantity must be a positive number.' });
      return;
    }

    const product = products.find(p => p.sequence === sequence);
    if (!product) {
      setFeedbackMessage({ type: 'error', text: 'Selected product not found.' });
      return;
    }

    const totalAllocatedForProduct = allocationResults
      .filter(ar => ar.sequence === sequence)
      .reduce((sum, ar) => sum + ar.quantity, 0);

    if (totalAllocatedForProduct + quantity > product.quantity) {
      setFeedbackMessage({
        type: 'error',
        text: `Cannot allocate ${quantity}. Available: ${product.quantity - totalAllocatedForProduct} for ASIN ${product.asin}.`,
      });
      return;
    }

    const existingAllocation = allocationResults.find(
      ar => ar.sequence === sequence && ar.company_id === company_id
    );

    if (existingAllocation) {
      setFeedbackMessage({
        type: 'error',
        text: `An allocation for ASIN ${product.asin} and this company already exists. Please edit the existing one.`,
      });
      return;
    }

    const { data: newAllocation, error } = await supabase
      .from('allocation_results')
      .insert({
        order_id: orderId,
        sequence,
        company_id,
        quantity,
      })
      .select('*, company(name), order_products(asin, price, cost_price, description)') // Ensure joined data is selected
      .single();

    if (error) {
      console.error('Error adding new allocation. Raw error object:', error);
      let detailedMessage = 'Failed to add new allocation.';
      if (typeof error === 'object' && error !== null) {
        const pgError = error as PostgrestError;
        if (pgError.message && typeof pgError.message === 'string') {
          detailedMessage += ` Message: ${pgError.message}`;
        }
        if (pgError.details && typeof pgError.details === 'string') {
          detailedMessage += ` Details: ${pgError.details}`;
        }
        if (pgError.hint && typeof pgError.hint === 'string') {
          detailedMessage += ` Hint: ${pgError.hint}`;
        }
        if (pgError.code && typeof pgError.code === 'string') {
          detailedMessage += ` Code: ${pgError.code}`;
        }
      }

      if (detailedMessage === 'Failed to add new allocation.' && typeof error === 'object' && error !== null && Object.keys(error).length > 0) {
        try {
          detailedMessage += ' Raw error: ' + JSON.stringify(error);
        } catch {
          detailedMessage += ' Raw error: (Could not stringify error object)';
        }
      } else if (detailedMessage === 'Failed to add new allocation.') {
        detailedMessage += ' An unexpected error occurred with the database operation. Please check console for details.';
      }
      setFeedbackMessage({ type: 'error', text: detailedMessage });
    } else if (newAllocation) {
      setAllocationResults(prev => [...prev, newAllocation as AllocationResult]);
      setEditedAllocations(prev => [
        ...prev,
        {
          id: (newAllocation as AllocationResult).id,
          quantity: (newAllocation as AllocationResult).quantity,
        },
      ]);
      setFeedbackMessage({ type: 'success', text: 'New allocation added successfully.' });
      setIsAddAllocationDialogOpen(false);
      setNewAllocationSequence('');
      setNewAllocationCompanyId('');
      setNewAllocationQuantity('');
    }
  };

  // Fee Calculation Logic
  const { totalProfit, totalOrderValue, profitPercentage } = useMemo(() => {
    let currentTotalProfit = 0;
    let currentTotalOrderValue = 0;

    products.forEach(product => {
      const productProfit = (product.price - product.cost_price) * product.quantity;
      currentTotalProfit += productProfit;
      currentTotalOrderValue += product.price * product.quantity;
    });

    const currentProfitPercentage = currentTotalOrderValue > 0 ? (currentTotalProfit / currentTotalOrderValue) * 100 : 0;

    return {
      totalProfit: currentTotalProfit,
      totalOrderValue: currentTotalOrderValue,
      profitPercentage: currentProfitPercentage,
    };
  }, [products]);


  if (authLoading || loading) {
    return <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center"><p className="text-gray-400">Loading...</p></div>;
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  if (!order) return (
    <div className="min-h-screen bg-[#14130F] p-6">
      <div className="mx-auto">
        <Link href="/admin/orders" className="text-[#c8aa64] hover:text-[#9d864e] mr-4">← Back to Orders</Link>
        <h1 className="text-3xl font-bold text-[#bfbfbf]">Order Not Found</h1>
        <p className="text-gray-400">The requested order does not exist or you don&apos;t have permission to view it.</p>
      </div>
    </div>
  );

  const isOrderEditable = order.order_statuses.description.toLowerCase() !== 'closed';
  const currentStatusId = statuses.find(s => s.description === order.order_statuses.description)?.order_status_id;

  const selectedProductForDialog = newAllocationSequence ? products.find(p => p.sequence === parseInt(newAllocationSequence)) : null;
  const maxAllocatableForDialog = selectedProductForDialog
    ? selectedProductForDialog.quantity - allocationResults
      .filter(ar => ar.sequence === selectedProductForDialog.sequence)
      .reduce((sum, ar) => sum + ar.quantity, 0)
    : undefined;

  const handlePreAssignDialogControl = (isOpen: boolean) => {
    setIsPreAssignDialogOpen(isOpen);
    if (!isOpen) {
      setSelectedSequence(null);
      setDialogCompanyId('');
      setDialogQuantity('');
    }
  };

  const handleDiscountDialogVisibilityChange = (isOpen: boolean) => {
    setIsDiscountDialogOpen(isOpen);
    if (!isOpen) {
      setDiscountCompanyId('');
      setDiscountSequence('');
      setDiscountPrice('');
      setDiscountPercentage('');
    }
  };

  const handleEditApplicationDialogVisibilityChange = (isOpen: boolean) => {
    setIsEditApplicationDialogOpen(isOpen);
    if (!isOpen) {
      setEditingApplication(null);
      setEditMaxInvestment(null);
      setEditProductsUngatedStatus({});
      setEditProductsUngatedMinAmounts({});
    }
  };

  const handleDeleteApplicationDialogVisibilityChange = (isOpen: boolean) => {
    setIsDeleteApplicationDialogOpen(isOpen);
    if (!isOpen) {
      setDeletingApplication(null);
    }
  };

  const handleWhitelistDialogVisibilityChange = (isOpen: boolean) => {
    setIsWhitelistDialogOpen(isOpen);
    if (!isOpen) {
      setWhitelistSearchTerm('');
    }
  };
  // END: Handlers for Dialog onOpenChange to reset state

  return (
    <div className="min-h-screen p-6 w-full">
      <div className="w-full">
        <div className="flex items-center mb-6 space-x-4">
          <Link href="/admin/orders" className="text-neutral-400 hover:text-white transition-colors text-sm">← Back to Orders</Link>
          <Link href={`/admin/orders/${orderId}/receipts`} className="text-neutral-400 hover:text-white transition-colors text-sm">Manage Receipts</Link>
        </div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Manage Order <span className="text-amber-500">#{order.order_id}</span></h1>
          <Button
            onClick={handleCalculateAllocation}
            disabled={isPending || !isOrderEditable}
            className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300 disabled:opacity-50"
          >
            {isPending ? 'Calculating...' : 'Calculate Order'}
          </Button>
        </div>

        {feedbackMessage && (
          <div className={`mb-6 p-4 rounded-xl border backdrop-blur-md flex items-center ${feedbackMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
            {feedbackMessage.type === 'success' ? <CheckCircle className="h-5 w-5 mr-3" /> : <XCircle className="h-5 w-5 mr-3" />}
            <span className="text-sm font-medium">{feedbackMessage.text}</span>
          </div>
        )}

        <GlassCard className="p-6 w-full mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <div>
              <Label htmlFor="orderStatus" className="text-neutral-400 font-medium block mb-2">Status</Label>
              <Select
                value={currentStatusId ? currentStatusId.toString() : ''}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger id="orderStatus" className="bg-white/[0.02] text-neutral-200 border-white/[0.05]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-neutral-200">
                  {statuses.map(status => (
                    <SelectItem key={status.order_status_id} value={status.order_status_id.toString()}>{status.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="leadTime" className="text-neutral-400 font-medium block mb-2">Lead Time (days)</Label>
              <Input
                id="leadTime"
                type="number"
                value={order.leadtime}
                onChange={(e) => handleOrderUpdate('leadtime', e.target.value)}
                className="bg-white/[0.02] text-neutral-200 border-white/[0.05]"
              />
            </div>
            <div>
              <Label htmlFor="deadline" className="text-neutral-400 font-medium block mb-2">Deadline</Label>
              <DatePicker
                value={order.deadline}
                onChange={(value) => handleOrderUpdate('deadline', value)}
              />
            </div>
            <div>
              <Label htmlFor="labelUploadDeadline" className="text-neutral-400 font-medium block mb-2">Label Upload Deadline</Label>
              <DatePicker
                value={order.label_upload_deadline}
                onChange={(value) => handleOrderUpdate('label_upload_deadline', value)}
              />
            </div>
            <div className="flex items-center space-x-3 pt-6">
              <Switch
                id="hideAllSwitch"
                checked={hideAll}
                onCheckedChange={handleHideAllToggle}
                disabled={!isOrderEditable}
                className="data-[state=checked]:bg-amber-500"
              />
              <Label htmlFor="hideAllSwitch" className="text-neutral-400 font-medium">Hide All Price & Qty</Label>
            </div>
            <div className="flex items-center space-x-3 pt-6">
              <Switch
                id="hideAllocationsSwitch"
                checked={order.hide_allocations}
                onCheckedChange={handleHideAllocationsToggle}
                disabled={!isOrderEditable}
                className="data-[state=checked]:bg-amber-500"
              />
              <Label htmlFor="hideAllocationsSwitch" className="text-neutral-400 font-medium">Hide Allocations</Label>
            </div>
            <div>
              <Label htmlFor="orderAccessibility" className="text-neutral-400 font-medium block mb-2">Accessibility</Label>
              <Select
                value={order.is_public ? 'public' : 'private'}
                onValueChange={handleAccessibilityChange}
                disabled={!isOrderEditable}
              >
                <SelectTrigger id="orderAccessibility" className="bg-white/[0.02] text-neutral-200 border-white/[0.05]">
                  <SelectValue placeholder="Select accessibility" />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-neutral-200">
                  <SelectItem value="public">Public (All Companies)</SelectItem>
                  <SelectItem value="private">Private (Whitelist Only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!order.is_public && (
              <div className="flex items-end">
                <Button
                  onClick={() => setIsWhitelistDialogOpen(true)}
                  className="w-full bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
                  disabled={!isOrderEditable}
                >
                  <ListPlus className="mr-2 h-4 w-4" /> Manage Whitelist
                </Button>
              </div>
            )}
            <div>
              <Label className="text-neutral-400 font-medium block mb-2">Total Fees Earned ($)</Label>
              <div className="p-3 bg-white/[0.02] text-white border border-white/[0.05] rounded-lg flex items-center font-bold">
                <DollarSign className="h-4 w-4 mr-2 text-emerald-400" />
                {totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <Label className="text-neutral-400 font-medium block mb-2">Total Fees Earned (%)</Label>
              <div className="p-3 bg-white/[0.02] text-white border border-white/[0.05] rounded-lg flex items-center font-bold">
                <Percent className="h-4 w-4 mr-2 text-blue-400" />
                {profitPercentage.toFixed(2)}%
              </div>
            </div>
            <div>
              <Label className="text-neutral-400 font-medium block mb-2">Total Order Value ($)</Label>
              <div className="p-3 bg-white/[0.02] text-white border border-white/[0.05] rounded-lg font-bold">
                {totalOrderValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </GlassCard>

        <Dialog open={isWhitelistDialogOpen} onOpenChange={handleWhitelistDialogVisibilityChange}>
          <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Manage Whitelist for Order <span className="text-amber-500">#{order.order_id}</span></DialogTitle>
            </DialogHeader>
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Currently Whitelisted</h3>
                {whitelistedCompanies.length === 0 ? (
                  <p className="text-neutral-500 text-sm italic">No companies whitelisted for this order.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {whitelistedCompanies.map(company => (
                      <div key={company.company_id} className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/[0.05] rounded-xl hover:bg-white/[0.05] transition-colors">
                        <span className="text-neutral-200 font-medium">{company.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveCompanyFromWhitelist(company.company_id)}
                          disabled={!isOrderEditable}
                          className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-white/[0.05]">
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">Add Companies</h3>
                <div className="relative mb-4">
                  <Input
                    type="text"
                    placeholder="Search companies..."
                    value={whitelistSearchTerm}
                    onChange={(e) => setWhitelistSearchTerm(e.target.value)}
                    className="bg-white/[0.02] text-neutral-200 border-white/[0.05] pl-10 h-11"
                    disabled={!isOrderEditable}
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                </div>
                {filteredAvailableCompanies.length === 0 ? (
                  <p className="text-neutral-500 text-sm italic">No companies available to add.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {filteredAvailableCompanies.map(company => (
                      <div key={company.company_id} className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/[0.05] rounded-xl group hover:border-amber-500/30 transition-all">
                        <span className="text-neutral-200">{company.name}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddCompanyToWhitelist(company.company_id)}
                          className="bg-white/[0.05] hover:bg-amber-500 hover:text-white border-white/[0.1] transition-all"
                          disabled={!isOrderEditable}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="pt-4 border-t border-white/[0.05]">
              <Button
                variant="ghost"
                onClick={() => setIsWhitelistDialogOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <GlassCard className="p-6 w-full mb-8">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center">
            <TrendingUp className="mr-2 h-5 w-5 text-amber-500" />
            Company Applications
          </h2>
          {companyApplications.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.05]">
              <p className="text-neutral-500 italic">No companies have applied for this order yet.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium h-12">Company</TableHead>
                    <TableHead className="text-neutral-400 font-medium h-12">Max Investment</TableHead>
                    <TableHead className="text-neutral-400 font-medium h-12">Ungated Products</TableHead>
                    <TableHead className="text-neutral-400 font-medium h-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companyApplications.map((app) => (
                    <TableRow key={app.company_id} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                      <TableCell className="py-4 font-medium text-white">{app.company_name}</TableCell>
                      <TableCell className="py-4 font-bold text-emerald-400">${app.max_investment.toLocaleString()}</TableCell>
                      <TableCell className="py-4">
                        <StatusPill type={app.ungated_count > 0 ? "active" : "pending"} text={`${app.ungated_count} products`} />
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditApplicationClick(app)}
                            className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all duration-300"
                            disabled={!isOrderEditable}
                          >
                            <Edit className="h-4 w-4 mr-1.5" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteApplicationClick(app)}
                            className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                            disabled={!isOrderEditable}
                          >
                            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </GlassCard>

        <Dialog open={isEditApplicationDialogOpen} onOpenChange={handleEditApplicationDialogVisibilityChange}>
          <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80] max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Application for {editingApplication?.company_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
              <div>
                <Label htmlFor="editMaxInvestment" className="block mb-2">Max Investment ($)</Label>
                <Input
                  id="editMaxInvestment"
                  type="number"
                  value={editMaxInvestment || ''}
                  onChange={(e) => setEditMaxInvestment(parseFloat(e.target.value) || null)}
                  className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                  min="0"
                />
              </div>

              <h3 className="text-lg font-semibold mt-6 mb-3">Product Ungated Status</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-gray-300">ASIN</TableHead>
                    <TableHead className="text-gray-300">Ungated?</TableHead>
                    <TableHead className="text-gray-300">Min Ungated Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editProductsData.map(product => (
                    <TableRow key={product.sequence} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                      <TableCell className="p-2">{product.asin}</TableCell>
                      <TableCell className="p-2">
                        <Checkbox
                          checked={editProductsUngatedStatus[product.sequence] || false}
                          onCheckedChange={(checked) => handleEditUngatedChange(product.sequence, checked === 'indeterminate' ? false : !!checked)}
                          className="w-4 h-4 text-[#c8aa64] bg-[#0d0d0d] border-[#a7a7a7] rounded"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input
                          type="number"
                          value={editProductsUngatedMinAmounts[product.sequence] || ''}
                          onChange={(e) => handleEditMinAmountChange(product.sequence, e.target.value)}
                          className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                          placeholder="Min Amount"
                          min="0"
                          disabled={!editProductsUngatedStatus[product.sequence]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter className="mt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditApplicationDialogOpen(false)}
                className="bg-amber-500/5 text-amber-400 font-medium border border-amber-500/15 hover:bg-amber-500/10 hover:border-amber-500/25 transition-all duration-300"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveApplicationChanges}
                className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteApplicationDialogOpen} onOpenChange={handleDeleteApplicationDialogVisibilityChange}>
          <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
            <DialogHeader>
              <DialogTitle>Confirm Deletion</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p>Are you sure you want to delete the application for <strong>{deletingApplication?.company_name}</strong>?</p>
              <p className="text-sm text-red-400">This action cannot be undone.</p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDeleteApplicationDialogOpen(false)}
                className="bg-amber-500/5 text-amber-400 font-medium border border-amber-500/15 hover:bg-amber-500/10 hover:border-amber-500/25 transition-all duration-300"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDeleteApplication}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <GlassCard className="p-6 w-full mb-8">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center">
            <Percent className="mr-2 h-5 w-5 text-amber-500" />
            Configured Discounts
          </h2>
          {discounts.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.05]">
              <p className="text-neutral-500 italic">No discounts configured for this order.</p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium h-12">Company</TableHead>
                    <TableHead className="text-neutral-400 font-medium h-12">ASIN</TableHead>
                    <TableHead className="text-neutral-400 font-medium h-12">Original Price</TableHead>
                    <TableHead className="text-neutral-400 font-medium h-12">Discounted Price</TableHead>
                    <TableHead className="text-neutral-400 font-medium h-12">Discount %</TableHead>
                    <TableHead className="text-neutral-400 font-medium h-12 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((discount) => {
                    const discountPercentageValue = discount.discounted_price
                      ? ((discount.original_price - discount.discounted_price) / discount.original_price * 100).toFixed(1)
                      : '0';
                    return (
                      <TableRow key={`${discount.sequence}-${discount.company_id}`} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                        <TableCell className="py-4 font-medium text-white">{discount.company_name}</TableCell>
                        <TableCell className="py-4 text-neutral-400 font-mono text-xs">{discount.asin}</TableCell>
                        <TableCell className="py-4 text-neutral-400">${discount.original_price.toFixed(2)}</TableCell>
                        <TableCell className="py-4 font-bold text-emerald-400">
                          {discount.discounted_price ? `$${discount.discounted_price.toFixed(2)}` : 'N/A'}
                        </TableCell>
                        <TableCell className="py-4">
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/20">
                            -{discountPercentageValue}%
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDiscountDialog(discount.sequence, discount.company_id, discount.discounted_price)}
                              className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all duration-300"
                              disabled={!isOrderEditable}
                            >
                              <Edit className="h-4 w-4 mr-1.5" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDiscountDelete(discount.sequence, discount.company_id)}
                              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                              disabled={!isOrderEditable}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-6 w-full mb-8 overflow-x-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center">
              <PackageSearch className="mr-2 h-5 w-5 text-amber-500" />
              Order Products
            </h2>
            <div className="flex gap-3">
              <Button
                onClick={() => openDiscountDialog()}
                className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
                disabled={!isOrderEditable}
              >
                <Percent className="mr-2 h-4 w-4" /> Discounts
              </Button>
              <Button
                onClick={handleProductAdd}
                className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
                disabled={!isOrderEditable}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </div>
          </div>
          {products.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.02] rounded-2xl border border-dashed border-white/[0.05]">
              <p className="text-neutral-500 italic">No products found.</p>
            </div>
          ) : (
            <div className="w-full">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium w-[80px]">Hide</TableHead>
                    <TableHead className="text-neutral-400 font-medium w-[150px]">ASIN</TableHead>
                    <TableHead className="text-neutral-400 font-medium w-[120px]">Cost</TableHead>
                    <TableHead className="text-neutral-400 font-medium w-[120px]">Price</TableHead>
                    <TableHead className="text-neutral-400 font-medium w-[100px]">Qty</TableHead>
                    <TableHead className="text-neutral-400 font-medium w-[100px]">ROI %</TableHead>
                    <TableHead className="text-neutral-400 font-medium min-w-[200px]">Description</TableHead>
                    <TableHead className="text-neutral-400 font-medium min-w-[200px]">Pre-Assigned</TableHead>
                    <TableHead className="text-neutral-400 font-medium w-[60px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const productPreAssignments = preAssignments.filter(pa => pa.sequence === product.sequence);
                    const totalAssigned = productPreAssignments
                      .filter(pa => pa.quantity !== null)
                      .reduce((sum, pa) => sum + (pa.quantity || 0), 0);

                    return (
                      <TableRow key={product.sequence} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                        <TableCell className="py-4">
                          <Switch
                            checked={product.hide_price_and_quantity}
                            onCheckedChange={(checked) => handleProductUpdate(product.sequence, 'hide_price_and_quantity', checked)}
                            disabled={!isOrderEditable}
                            className="data-[state=checked]:bg-amber-500"
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <Input
                            value={product.asin}
                            onChange={(e) => handleProductUpdate(product.sequence, 'asin', e.target.value)}
                            className="bg-white/[0.02] text-neutral-200 border-white/[0.05] h-9"
                            disabled={!isOrderEditable}
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <Input
                            type="number"
                            value={product.cost_price}
                            onChange={(e) => handleProductUpdate(product.sequence, 'cost_price', e.target.value)}
                            className="bg-white/[0.02] text-neutral-200 border-white/[0.05] h-9"
                            disabled={!isOrderEditable}
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <Input
                            type="number"
                            value={product.price}
                            onChange={(e) => handleProductUpdate(product.sequence, 'price', e.target.value)}
                            className="bg-white/[0.02] text-neutral-200 border-white/[0.05] h-9"
                            disabled={!isOrderEditable}
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <Input
                            type="number"
                            value={product.quantity}
                            onChange={(e) => handleProductUpdate(product.sequence, 'quantity', e.target.value)}
                            className="bg-white/[0.02] text-neutral-200 border-white/[0.05] h-9"
                            disabled={!isOrderEditable}
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <Input
                            type="number"
                            value={product.roi ?? ''}
                            onChange={(e) => handleProductUpdate(product.sequence, 'roi', e.target.value)}
                            className="bg-white/[0.02] text-neutral-200 border-white/[0.05] h-9"
                            disabled={!isOrderEditable}
                            placeholder="N/A"
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <Input
                            value={product.description || ''}
                            onChange={(e) => handleProductUpdate(product.sequence, 'description', e.target.value)}
                            className="bg-white/[0.02] text-neutral-200 border-white/[0.05] h-9"
                            disabled={!isOrderEditable}
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex flex-col gap-2">
                            {productPreAssignments.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {productPreAssignments.map(pa => (
                                  <div key={pa.assignment_id} className="flex items-center bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg pl-2 pr-1 h-7 text-xs font-semibold">
                                    <span>{pa.company_name}: {pa.quantity || 'Full'}</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handlePreAssignRemove(pa.assignment_id)}
                                      disabled={!isOrderEditable}
                                      className="h-5 w-5 p-0 ml-1 hover:bg-amber-500/20"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-neutral-500 text-xs italic">No pre-assignments</span>
                            )}
                            <Dialog open={isPreAssignDialogOpen && selectedSequence === product.sequence} onOpenChange={handlePreAssignDialogControl}>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-1 h-8 text-xs bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all duration-300"
                                  disabled={!isOrderEditable}
                                  onClick={() => {
                                    setSelectedSequence(product.sequence);
                                    setIsPreAssignDialogOpen(true);
                                  }}
                                >
                                  <Plus className="mr-1 h-3 w-3" /> Pre-Assign
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-white">
                                <DialogHeader>
                                  <DialogTitle>Pre-Assign Product (ASIN: {product.asin})</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div>
                                    <Label htmlFor="preAssignCompany" className="block mb-2 text-neutral-400">Company</Label>
                                    <Select value={dialogCompanyId} onValueChange={setDialogCompanyId}>
                                      <SelectTrigger id="preAssignCompany" className="bg-white/[0.02] border-white/[0.05]">
                                        <SelectValue placeholder="Select a company" />
                                      </SelectTrigger>
                                      <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-white">
                                        {companies.map(company => (
                                          <SelectItem key={company.company_id} value={company.company_id.toString()}>
                                            {company.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label htmlFor="preAssignQuantity" className="block mb-2 text-neutral-400">Quantity (optional, max: {product.quantity - totalAssigned})</Label>
                                    <Input
                                      id="preAssignQuantity"
                                      type="number"
                                      value={dialogQuantity}
                                      onChange={(e) => setDialogQuantity(e.target.value)}
                                      className="bg-white/[0.02] border-white/[0.05]"
                                      placeholder="Leave blank for full remaining"
                                      min="1"
                                      max={product.quantity - totalAssigned}
                                    />
                                  </div>
                                  <Button
                                    onClick={handlePreAssign}
                                    className="w-full bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
                                  >
                                    Confirm Pre-Assignment
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleProductRemove(product.sequence)}
                            disabled={!isOrderEditable}
                            className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </GlassCard>

        <Dialog open={isDiscountDialogOpen} onOpenChange={handleDiscountDialogVisibilityChange}>
          <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
            <DialogHeader>
              <DialogTitle>Configure Discount</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="discountCompany" className="block mb-2 text-neutral-400 text-sm">Target Company</Label>
                <Select value={discountCompanyId} onValueChange={setDiscountCompanyId}>
                  <SelectTrigger id="discountCompany" className="bg-white/[0.02] border-white/[0.05] text-white">
                    <SelectValue placeholder="Select a company" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-white">
                    {companies.map(c => (
                      <SelectItem key={c.company_id} value={c.company_id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="discountAsin" className="block mb-2 text-neutral-400 text-sm">Target Product (ASIN)</Label>
                <Select value={discountSequence} onValueChange={setDiscountSequence}>
                  <SelectTrigger id="discountAsin" className="bg-white/[0.02] border-white/[0.05] text-white">
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-white">
                    {products.map(p => (
                      <SelectItem key={p.sequence} value={p.sequence.toString()}>
                        {p.asin} - {p.description || 'No description'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="originalPrice" className="block mb-2 text-neutral-400 text-sm">Original Price</Label>
                <Input
                  id="originalPrice"
                  type="number"
                  value={products.find(p => p.sequence === parseInt(discountSequence))?.price.toFixed(2) || ''}
                  className="bg-white/[0.05] text-neutral-400 border-white/[0.05]"
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="discountedPrice" className="block mb-2 text-neutral-400 text-sm">Discounted Price ($)</Label>
                <Input
                  id="discountedPrice"
                  type="number"
                  value={discountPrice}
                  onChange={(e) => {
                    setDiscountPrice(e.target.value);
                    setDiscountPercentage('');
                  }}
                  className="bg-white/[0.02] border-white/[0.05] text-white"
                  placeholder="Enter discounted price"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <Label htmlFor="discountPercentage" className="block mb-2 text-neutral-400 text-sm">Quick Discount %</Label>
                <Select value={discountPercentage} onValueChange={handleDiscountPercentageChange}>
                  <SelectTrigger id="discountPercentage" className="bg-white/[0.02] border-white/[0.05] text-white">
                    <SelectValue placeholder="Select percentage" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-white">
                    {['5', '10', '20', '25', '30', '40', '50'].map(percentage => (
                      <SelectItem key={percentage} value={percentage}>
                        {percentage}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setIsDiscountDialogOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDiscountSave}
                  className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
                >
                  Save Discount
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {allocationResults.length > 0 && (
        <GlassCard className="p-6 w-full mt-8 overflow-x-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center">
              <TrendingUp className="mr-2 h-5 w-5 text-amber-500" />
              Allocation Results
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setNewAllocationSequence('');
                  setNewAllocationCompanyId('');
                  setNewAllocationQuantity('');
                  setIsAddAllocationDialogOpen(true);
                }}
                className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
                disabled={!isOrderEditable || availableProductsForNewAllocation.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Allocation
              </Button>
              <Button
                onClick={() => setIsCompanyAllocationSummaryDialogOpen(true)}
                className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
              >
                <TrendingUp className="mr-2 h-4 w-4" /> Summary
              </Button>
              <Button
                onClick={() => setIsUnallocatedProductsDialogOpen(true)}
                className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
              >
                <PackageSearch className="mr-2 h-4 w-4" /> Unallocated
              </Button>
              <Button
                onClick={handleDownloadAllocationResults}
                className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
              >
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-white/[0.05]">
                <TableHead className="text-neutral-400 font-medium h-12">ASIN</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12">Company</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12">Quantity</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12">Price</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12">Cost</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12">Description</TableHead>
                <TableHead className="text-neutral-400 font-medium h-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocationResults.map((result) => {
                const edited = editedAllocations.find(a => a.id === result.id);
                return (
                  <TableRow key={result.id} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                    <TableCell className="py-4 text-neutral-400 font-mono text-xs">{result.order_products?.asin || 'N/A'}</TableCell>
                    <TableCell className="py-4 font-medium text-white">{result.company?.name || 'Unknown'}</TableCell>
                    <TableCell className="py-4">
                      <Input
                        type="number"
                        value={edited?.quantity ?? result.quantity}
                        onChange={(e) => handleAllocationChange(result.id, 'quantity', parseInt(e.target.value))}
                        className="bg-white/[0.02] text-neutral-200 border-white/[0.05] h-9 w-[100px]"
                        min="0"
                        disabled={!isOrderEditable}
                      />
                    </TableCell>
                    <TableCell className="py-4 text-neutral-400">${result.order_products?.price?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell className="py-4 text-neutral-400">${result.order_products?.cost_price?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell className="py-4 text-neutral-400 text-sm">{result.order_products?.description || 'N/A'}</TableCell>
                    <TableCell className="py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <Button
                          onClick={() => handleAllocationSave(result.id)}
                          className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all duration-300 h-9"
                          disabled={!isOrderEditable || (edited?.quantity === result.quantity)}
                          size="sm"
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAllocationDelete(result.id)}
                          disabled={!isOrderEditable}
                          className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-9"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </GlassCard>
      )}

      {/* Add New Allocation Dialog */}
      <Dialog open={isAddAllocationDialogOpen} onOpenChange={setIsAddAllocationDialogOpen}>
        <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-white">
          <DialogHeader>
            <DialogTitle>Add New Allocation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="newAllocationAsin" className="block mb-2 text-neutral-400 text-sm">ASIN (Product)</Label>
              <Select value={newAllocationSequence} onValueChange={setNewAllocationSequence}>
                <SelectTrigger id="newAllocationAsin" className="bg-white/[0.02] border-white/[0.05] text-white">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-white">
                  {availableProductsForNewAllocation.length === 0 ? (
                    <SelectItem value="disabled" disabled>No products available</SelectItem>
                  ) : (
                    availableProductsForNewAllocation.map(product => {
                      const allocatedQty = allocationResults.filter(ar => ar.sequence === product.sequence).reduce((sum, ar) => sum + ar.quantity, 0);
                      const remainingQty = product.quantity - allocatedQty;
                      return (
                        <SelectItem key={product.sequence} value={product.sequence.toString()}>
                          {product.asin} (Available: {remainingQty})
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="newAllocationCompany" className="block mb-2 text-neutral-400 text-sm">Company</Label>
              <Select value={newAllocationCompanyId} onValueChange={setNewAllocationCompanyId}>
                <SelectTrigger id="newAllocationCompany" className="bg-white/[0.02] border-white/[0.05] text-white">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a0a] border-white/[0.08] text-white">
                  {companyApplications.length === 0 ? (
                    <SelectItem value="disabled" disabled>No applications</SelectItem>
                  ) : (
                    companyApplications.map(app => (
                      <SelectItem key={app.company_id} value={app.company_id.toString()}>
                        {app.company_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="newAllocationQuantity" className="block mb-2 text-neutral-400 text-sm">Quantity</Label>
              <Input
                id="newAllocationQuantity"
                type="number"
                value={newAllocationQuantity}
                onChange={(e) => setNewAllocationQuantity(e.target.value)}
                className="bg-white/[0.02] border-white/[0.05] text-white"
                placeholder="Enter quantity"
                min="1"
                max={maxAllocatableForDialog}
              />
              {newAllocationSequence && (
                <p className="text-xs text-neutral-500 mt-1.5 flex items-center italic">
                  <Info className="h-3 w-3 mr-1" /> Max allocatable: {maxAllocatableForDialog}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsAddAllocationDialogOpen(false)}
              className="text-neutral-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddNewAllocationSave}
              className="bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.05)] hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] hover:border-amber-500/30 transition-all duration-300"
              disabled={!newAllocationSequence || !newAllocationCompanyId || !newAllocationQuantity || parseInt(newAllocationQuantity) <= 0 || (maxAllocatableForDialog !== undefined && parseInt(newAllocationQuantity) > maxAllocatableForDialog)}
            >
              Save Allocation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCompanyAllocationSummaryDialogOpen} onOpenChange={setIsCompanyAllocationSummaryDialogOpen}>
        <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle>Company Allocation Summary for Order <span className="text-amber-500">#{order?.order_id}</span></DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            {companyAllocationSummary.length === 0 ? (
              <p className="text-neutral-500 italic p-8 text-center">No allocations found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium">Company Name</TableHead>
                    <TableHead className="text-neutral-400 font-medium text-right">Max Investment</TableHead>
                    <TableHead className="text-neutral-400 font-medium text-right">Total Allocated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companyAllocationSummary.map((summary) => (
                    <TableRow key={summary.company_id} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                      <TableCell className="text-white font-medium py-4">{summary.company_name}</TableCell>
                      <TableCell className="text-neutral-400 text-right py-4">${summary.max_investment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-emerald-400 text-right font-bold py-4">${summary.totalAllocatedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter className="pt-4 border-t border-white/[0.05]">
            <Button
              variant="ghost"
              onClick={() => setIsCompanyAllocationSummaryDialogOpen(false)}
              className="text-neutral-400 hover:text-white"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUnallocatedProductsDialogOpen} onOpenChange={setIsUnallocatedProductsDialogOpen}>
        <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle>Unallocated Products for Order <span className="text-amber-500">#{order?.order_id}</span></DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-2">
            {unallocatedProductsSummary.length === 0 ? (
              <p className="text-neutral-500 italic p-8 text-center">All products have been fully allocated.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium">ASIN</TableHead>
                    <TableHead className="text-neutral-400 font-medium">Description</TableHead>
                    <TableHead className="text-neutral-400 font-medium text-right">Total Qty</TableHead>
                    <TableHead className="text-neutral-400 font-medium text-right">Allocated</TableHead>
                    <TableHead className="text-neutral-400 font-medium text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unallocatedProductsSummary.map((product) => (
                    <TableRow key={product.sequence} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                      <TableCell className="text-white font-mono text-xs">{product.asin}</TableCell>
                      <TableCell className="text-neutral-400 text-sm">{product.description || 'N/A'}</TableCell>
                      <TableCell className="text-neutral-200 text-right">{product.quantity}</TableCell>
                      <TableCell className="text-emerald-400 text-right">{product.totalAllocatedForProduct}</TableCell>
                      <TableCell className="text-rose-400 text-right font-bold">{product.unallocatedQuantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter className="pt-4 border-t border-white/[0.05]">
            <Button
              variant="ghost"
              onClick={() => setIsUnallocatedProductsDialogOpen(false)}
              className="text-neutral-400 hover:text-white"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
