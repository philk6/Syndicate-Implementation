'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import { CalendarIcon, Download, Trash2, Plus, Percent } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
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
  roi: number | null;
  needs_review: boolean;
  created_at: string;
  company: { name: string } | null;
  order_products: { asin: string; price: number; cost_price: number; description: string | null } | null;
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
      const formattedDate = selectedDate.toISOString().slice(0, 16);
      onChange(formattedDate);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          initialFocus
        />
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [dialogCompanyId, setDialogCompanyId] = useState<string>('');
  const [dialogQuantity, setDialogQuantity] = useState<string>('');
  const [isDiscountDialogOpen, setIsDiscountDialogOpen] = useState(false);
  const [discountCompanyId, setDiscountCompanyId] = useState<string>('');
  const [discountSequence, setDiscountSequence] = useState<string>('');
  const [discountPrice, setDiscountPrice] = useState<string>('');
  const [discountPercentage, setDiscountPercentage] = useState<string>('');
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [allocationResults, setAllocationResults] = useState<AllocationResult[]>([]);
  const [hideAll, setHideAll] = useState<boolean>(false);

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
          .select('order_id, leadtime, deadline, label_upload_deadline, order_statuses(description)')
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

        const { data: preAssignmentData, error: preAssignmentError } = await supabase
          .from('order_pre_assignments')
          .select('assignment_id, order_id, sequence, company_id, company(name), quantity')
          .eq('order_id', orderId) as { data: PreAssignmentQueryResult[] | null, error: PostgrestError | null };

        if (preAssignmentError) {
          console.error('Error fetching pre-assignments:', preAssignmentError);
        }

        // Updated query for company applications
        const { data: applicationData, error: applicationError } = await supabase
          .from('order_company')
          .select(`
            company_id,
            max_investment,
            company:company_id (name)
          `)
          .eq('order_id', orderId);

        if (applicationError) {
          console.error('Error fetching company applications:', applicationError);
          setCompanyApplications([]);
        } else if (applicationData && applicationData.length > 0) {
          const companyApps = await Promise.all(
            applicationData.map(async (app: { company_id: number; max_investment: number; company: { name: string } | Array<{ name: string }> }) => {
              // Log raw data for debugging
              console.log(`Raw application data for company_id ${app.company_id}:`, JSON.stringify(app, null, 2));

              const { data: ungatedData, error: ungatedError } = await supabase
                .from('order_products_company')
                .select('sequence')
                .eq('order_id', orderId)
                .eq('company_id', app.company_id)
                .eq('ungated', true);

              if (ungatedError) {
                console.error(`Error fetching ungated products for company ${app.company_id}:`, ungatedError);
              }

              // Handle company.name access properly for both object and array cases
              const companyObj = Array.isArray(app.company) ? app.company[0] : app.company;
              const companyName = companyObj && companyObj.name ? companyObj.name : 'Unknown';
              if (companyName === 'Unknown') {
                console.warn(`No valid company name for company_id: ${app.company_id}. Company object:`, app.company);
              }

              return {
                company_id: app.company_id,
                company_name: companyName,
                max_investment: app.max_investment,
                ungated_count: ungatedData?.length || 0,
              };
            })
          );

          console.log('Processed company applications:', JSON.stringify(companyApps, null, 2));
          const sortedApps = companyApps.sort((a, b) => b.max_investment - a.max_investment);
          setCompanyApplications(sortedApps);
        } else {
          setCompanyApplications([]);
        }

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
              const orderProducts = Array.isArray(d.order_products) ? d.order_products[0] : d.order_products;
              
              return {
                order_id: d.order_id,
                sequence: d.sequence,
                company_id: d.company_id,
                company_name: company?.name || 'Unknown',
                asin: orderProducts?.asin || 'Unknown',
                original_price: orderProducts?.price || 0,
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
        setHideAll(productData?.every(p => p.hide_price_and_quantity) || false);
        setLoading(false);
      }

      fetchData();
    }
  }, [orderId, isAuthenticated, authLoading, router, user?.role]);

  const handleStatusChange = async (newStatusId: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ order_status_id: parseInt(newStatusId) })
      .eq('order_id', orderId);

    if (error) {
      console.error('Error updating status:', error);
    } else {
      setOrder(prev => prev ? { ...prev, order_statuses: statuses.find(s => s.order_status_id === parseInt(newStatusId))! } : null);
    }
  };

  const updateProduct = useCallback(async (sequence: number, field: keyof OrderProduct | 'roi' | 'hide_price_and_quantity', value: string | number | boolean) => {
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
  }, [products, orderId, setProducts, setHideAll]);

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
      setProducts(prev => prev.map(p => ({ ...p, hide_price_and_quantity: !checked })));
      setHideAll(!checked);
    }
  };

  const handleProductRemove = async (sequence: number) => {
    const { error } = await supabase
      .from('order_products')
      .delete()
      .eq('order_id', orderId)
      .eq('sequence', sequence);

    if (error) {
      console.error('Error removing product:', error);
    } else {
      setProducts(prev => prev.filter(p => p.sequence !== sequence));
      setPreAssignments(prev => prev.filter(pa => pa.sequence !== sequence));
      setDiscounts(prev => prev.filter(d => d.sequence !== sequence));
      setHideAll(products.filter(p => p.sequence !== sequence).every(p => p.hide_price_and_quantity));
    }
  };

  const handleProductAdd = async () => {
    const newSequence = Math.max(...products.map(p => p.sequence), 0) + 1;
    const newProduct = {
      order_id: orderId,
      sequence: newSequence,
      asin: 'NEW-ASIN',
      quantity: 1,
      price: 0,
      description: 'New Product',
      cost_price: 0,
      hide_price_and_quantity: hideAll,
      roi: 0,
    };

    const { error } = await supabase
      .from('order_products')
      .insert(newProduct);

    if (error) {
      console.error('Error adding product:', error);
    } else {
      setProducts(prev => [...prev, newProduct]);
    }
  };

  const updateOrder = useCallback(async (field: 'leadtime' | 'deadline' | 'label_upload_deadline', value: string | number) => {
    const updatedValue = field === 'leadtime' ? parseInt(value as string) : value;
    const { error } = await supabase
      .from('orders')
      .update({ [field]: updatedValue })
      .eq('order_id', orderId);

    if (error) {
      console.error('Error updating order:', error);
    } else {
      setOrder(prev => prev ? { ...prev, [field]: updatedValue } : null);
    }
  }, [orderId, setOrder]);

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
      alert('Please select a company.');
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
      alert(`Total pre-assigned quantity (${newTotal}) exceeds available amount (${product.quantity}).`);
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
      alert('Failed to add pre-assignment.');
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
      setIsDialogOpen(false);
      setDialogCompanyId('');
      setDialogQuantity('');
      setSelectedSequence(null);
    }
  };

  const handlePreAssignRemove = async (assignmentId: number) => {
    const { error } = await supabase
      .from('order_pre_assignments')
      .delete()
      .eq('assignment_id', assignmentId);

    if (error) {
      console.error('Error removing pre-assignment:', error);
      alert('Failed to remove pre-assignment.');
    } else {
      setPreAssignments(prev => prev.filter(pa => pa.assignment_id !== assignmentId));
    }
  };

  const openPreAssignDialog = (sequence: number) => {
    setSelectedSequence(sequence);
    setDialogCompanyId('');
    setDialogQuantity('');
    setIsDialogOpen(true);
  };

  const handleCalculateAllocation = () => {
    setFeedbackMessage(null);
    startTransition(async () => {
      const result = await calculateOrderAllocation(orderId);
      setFeedbackMessage({ type: result.success ? 'success' : 'error', text: result.message });

      if (result.success) {
        const { data: allocationData } = await supabase
          .from('allocation_results')
          .select('*, company(name), order_products(asin, price, cost_price, description)')
          .eq('order_id', orderId);
        setAllocationResults(allocationData || []);
        router.refresh();
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
      alert('Please select a company and product.');
      return;
    }

    const company_id = parseInt(discountCompanyId);
    const sequence = parseInt(discountSequence);
    const discounted_price = parseFloat(discountPrice) || null;

    if (discounted_price !== null) {
      const product = products.find(p => p.sequence === sequence);
      if (!product) {
        alert('Invalid product selected.');
        return;
      }
      if (discounted_price >= product.price) {
        alert('Discounted price must be less than the original price.');
        return;
      }
      if (discounted_price <= 0) {
        alert('Discounted price must be greater than zero.');
        return;
      }
    }

    const { error: opcError } = await supabase
      .from('order_products_company')
      .upsert({
        order_id: orderId,
        sequence,
        company_id,
        discounted_price,
        ungated: false,
        quantity: 0,
      }, {
        onConflict: 'order_id,sequence,company_id',
      });

    if (opcError) {
      console.error('Error saving discount:', opcError);
      alert('Failed to save discount.');
      return;
    }

    const { error: ocError } = await supabase
      .from('order_company')
      .update({ has_discounts: discounted_price !== null })
      .eq('order_id', orderId)
      .eq('company_id', company_id);

    if (ocError) {
      console.error('Error updating has_discounts:', ocError);
      alert('Failed to update discount status.');
      return;
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
      .update({ discounted_price: null })
      .eq('order_id', orderId)
      .eq('sequence', sequence)
      .eq('company_id', company_id);

    if (opcError) {
      console.error('Error deleting discount:', opcError);
      alert('Failed to delete discount.');
      return;
    }

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
      alert('Failed to update discount status.');
      return;
    }

    setDiscounts(prev => prev.filter(d => !(d.sequence === sequence && d.company_id === company_id)));
  };

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

  return (
    <div className="min-h-screen bg-background p-6 w-full">
      <div className="w-full">
        <div className="flex items-center mb-6">
          <Link href="/admin/orders" className="text-[#c8aa64] hover:text-[#9d864e] mr-4">← Back to Orders</Link>
          <Link href={`/admin/orders/${orderId}/receipts`} className="text-[#c8aa64] hover:text-[#9d864e] mr-4">Manage Receipts</Link>
        </div>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-[#bfbfbf]">Manage Order #{order.order_id}</h1>
          <Button
            onClick={handleCalculateAllocation}
            disabled={isPending || !isOrderEditable}
            className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424] disabled:opacity-50"
          >
            {isPending ? 'Calculating...' : 'Calculate Order'}
          </Button>
        </div>

        {feedbackMessage && (
          <div className={`mb-4 p-3 rounded ${feedbackMessage.type === 'success' ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
            {feedbackMessage.text}
          </div>
        )}

        <div className="rounded-lg p-6 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] shadow-lg w-full mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-gray-300 font-medium block mb-2">Status</label>
              <Select
                value={currentStatusId ? currentStatusId.toString() : ''}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(status => (
                    <SelectItem key={status.order_status_id} value={status.order_status_id.toString()}>{status.description}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-gray-300 font-medium block mb-2">Lead Time (days)</label>
              <Input
                type="number"
                value={order.leadtime}
                onChange={(e) => handleOrderUpdate('leadtime', e.target.value)}
                className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
              />
            </div>
            <div>
              <label className="text-gray-300 font-medium block mb-2">Deadline</label>
              <DatePicker
                value={order.deadline}
                onChange={(value) => handleOrderUpdate('deadline', value)}
              />
            </div>
            <div>
              <label className="text-gray-300 font-medium block mb-2">Label Upload Deadline</label>
              <DatePicker
                value={order.label_upload_deadline}
                onChange={(value) => handleOrderUpdate('label_upload_deadline', value)}
              />
            </div>
            <div>
              <label className="text-gray-300 font-medium block mb-2">Hide All Price and Quantity</label>
              <Switch
                checked={hideAll}
                onCheckedChange={handleHideAllToggle}
                disabled={!isOrderEditable}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg p-6 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] shadow-lg w-full mb-8">
          <h2 className="text-xl font-semibold text-gray-300 mb-4">Company Applications</h2>
          {companyApplications.length === 0 ? (
            <p className="text-gray-400">No companies have applied for this order yet.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Company</TableHead>
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Max Investment ($)</TableHead>
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Ungated Products</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companyApplications.map((app) => (
                    <TableRow key={app.company_id} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                      <TableCell className="p-4 align-middle text-gray-300">{app.company_name}</TableCell>
                      <TableCell className="p-4 align-middle text-gray-300">${app.max_investment.toLocaleString()}</TableCell>
                      <TableCell className="p-4 align-middle text-gray-300">{app.ungated_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="rounded-lg p-6 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] shadow-lg w-full mb-8">
          <h2 className="text-xl font-semibold text-gray-300 mb-4">Configured Discounts</h2>
          {discounts.length === 0 ? (
            <p className="text-gray-400">No discounts configured for this order.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Company</TableHead>
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">ASIN</TableHead>
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Original Price</TableHead>
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Discounted Price</TableHead>
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Discount %</TableHead>
                    <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discounts.map((discount) => {
                    const discountPercentage = discount.discounted_price
                      ? ((discount.original_price - discount.discounted_price) / discount.original_price * 100).toFixed(1)
                      : '0';
                    return (
                      <TableRow key={`${discount.sequence}-${discount.company_id}`} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                        <TableCell className="p-4 align-middle text-gray-300">{discount.company_name}</TableCell>
                        <TableCell className="p-4 align-middle text-gray-300">{discount.asin}</TableCell>
                        <TableCell className="p-4 align-middle text-gray-300">${discount.original_price.toFixed(2)}</TableCell>
                        <TableCell className="p-4 align-middle text-gray-300">
                          {discount.discounted_price ? `$${discount.discounted_price.toFixed(2)}` : 'N/A'}
                        </TableCell>
                        <TableCell className="p-4 align-middle text-gray-300">{discountPercentage}%</TableCell>
                        <TableCell className="p-4 align-middle text-gray-300">
                          <Button
                            className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424] mr-2"
                            onClick={() => openDiscountDialog(discount.sequence, discount.company_id, discount.discounted_price)}
                            disabled={!isOrderEditable}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDiscountDelete(discount.sequence, discount.company_id)}
                            disabled={!isOrderEditable}
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
        </div>

        <div className="rounded-lg p-6 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] shadow-lg w-full overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-300">Order Products</h2>
            <div className="flex gap-2">
              <Button
                onClick={() => openDiscountDialog()}
                className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                disabled={!isOrderEditable}
              >
                <Percent className="mr-2 h-4 w-4" /> Configure Discounts
              </Button>
              <Button
                onClick={handleProductAdd}
                className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                disabled={!isOrderEditable}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </div>
          </div>
          {products.length === 0 ? (
            <p className="text-gray-400">No products found.</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse bg-transparent" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="border-[#2B2B2B] hover:bg-transparent">
                    <th className="text-gray-300 w-[10%] h-12 px-4 text-left align-middle font-medium">Hide Price</th>
                    <th className="text-gray-300 w-[10%] h-12 px-4 text-left align-middle font-medium">ASIN</th>
                    <th className="text-gray-300 w-[10%] h-12 px-4 text-left align-middle font-medium">Cost Price</th>
                    <th className="text-gray-300 w-[10%] h-12 px-4 text-left align-middle font-medium">Price</th>
                    <th className="text-gray-300 w-[10%] h-12 px-4 text-left align-middle font-medium">Quantity</th>
                    <th className="text-gray-300 w-[10%] h-12 px-4 text-left align-middle font-medium">ROI (%)</th>
                    <th className="text-gray-300 w-[20%] h-12 px-4 text-left align-middle font-medium">Description</th>
                    <th className="text-gray-300 w-[20%] h-12 px-4 text-left align-middle font-medium">Pre-Assigned To</th>
                    <th className="text-gray-300 w-[10%] h-12 px-4 text-left align-middle font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const productPreAssignments = preAssignments.filter(pa => pa.sequence === product.sequence);
                    const totalAssigned = productPreAssignments
                      .filter(pa => pa.quantity !== null)
                      .reduce((sum, pa) => sum + (pa.quantity || 0), 0);

                    return (
                      <tr key={product.sequence} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          <Switch
                            checked={product.hide_price_and_quantity}
                            onCheckedChange={(checked) => handleProductUpdate(product.sequence, 'hide_price_and_quantity', checked)}
                            disabled={!isOrderEditable}
                          />
                        </td>
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          <Input
                            value={product.asin}
                            onChange={(e) => handleProductUpdate(product.sequence, 'asin', e.target.value)}
                            className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                            disabled={!isOrderEditable}
                          />
                        </td>
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          {product.asin === 'NEW-ASIN' ? (
                            <Input
                              type="number"
                              value={product.cost_price}
                              onChange={(e) => handleProductUpdate(product.sequence, 'cost_price', e.target.value)}
                              className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                              disabled={!isOrderEditable}
                            />
                          ) : (
                            <span className="text-gray-300">{product.cost_price}</span>
                          )}
                        </td>
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          <Input
                            type="number"
                            value={product.price}
                            onChange={(e) => handleProductUpdate(product.sequence, 'price', e.target.value)}
                            className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                            disabled={!isOrderEditable}
                          />
                        </td>
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          <Input
                            type="number"
                            value={product.quantity}
                            onChange={(e) => handleProductUpdate(product.sequence, 'quantity', e.target.value)}
                            className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                            disabled={!isOrderEditable}
                          />
                        </td>
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          <Input
                            type="number"
                            value={product.roi ?? ''}
                            onChange={(e) => handleProductUpdate(product.sequence, 'roi', e.target.value)}
                            className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                            disabled={!isOrderEditable}
                            placeholder="N/A"
                          />
                        </td>
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          <Input
                            value={product.description || ''}
                            onChange={(e) => handleProductUpdate(product.sequence, 'description', e.target.value)}
                            className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                            disabled={!isOrderEditable}
                          />
                        </td>
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          <div className="flex flex-col gap-2">
                            {productPreAssignments.length > 0 ? (
                              productPreAssignments.map(pa => (
                                <div key={pa.assignment_id} className="flex items-center gap-2">
                                  <span>{pa.company_name} ({pa.quantity || 'Full'})</span>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handlePreAssignRemove(pa.assignment_id)}
                                    disabled={!isOrderEditable}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))
                            ) : (
                              <span className="text-gray-400">None</span>
                            )}
                            <Dialog open={isDialogOpen && selectedSequence === product.sequence} onOpenChange={(open: boolean) => {
                              if (open) openPreAssignDialog(product.sequence);
                              else setIsDialogOpen(false);
                            }}>
                              <DialogTrigger asChild>
                                <Button
                                  className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424] mt-2"
                                  disabled={!isOrderEditable}
                                >
                                  Add Pre-Assignment
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
                                <DialogHeader>
                                  <DialogTitle>Pre-Assign Product (ASIN: {product.asin})</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <label className="text-gray-300 font-medium block mb-2">Company</label>
                                    <Select value={dialogCompanyId} onValueChange={setDialogCompanyId}>
                                      <SelectTrigger className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
                                        <SelectValue placeholder="Select a company" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {companies.map(company => (
                                          <SelectItem key={company.company_id} value={company.company_id.toString()}>
                                            {company.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="text-gray-300 font-medium block mb-2">Quantity (optional, max: {product.quantity - totalAssigned})</label>
                                    <Input
                                      type="number"
                                      value={dialogQuantity}
                                      onChange={(e) => setDialogQuantity(e.target.value)}
                                      className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                                      placeholder="Leave blank for full remaining"
                                      min="1"
                                      max={product.quantity - totalAssigned}
                                    />
                                  </div>
                                  <Button
                                    onClick={handlePreAssign}
                                    className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                                  >
                                    Confirm
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </td>
                        <td className="p-4 align-middle" style={{ overflowWrap: 'break-word' }}>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleProductRemove(product.sequence)}
                            disabled={!isOrderEditable}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Dialog open={isDiscountDialogOpen} onOpenChange={setIsDiscountDialogOpen}>
            <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
              <DialogHeader>
                <DialogTitle>Configure Discount</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-300 font-medium block mb-2">Company</label>
                  <Select value={discountCompanyId} onValueChange={setDiscountCompanyId}>
                    <SelectTrigger className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companyApplications.map(company => (
                        <SelectItem key={company.company_id} value={company.company_id.toString()}>
                          {company.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-gray-300 font-medium block mb-2">Product (ASIN)</label>
                  <Select value={discountSequence} onValueChange={setDiscountSequence}>
                    <SelectTrigger className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(product => (
                        <SelectItem key={product.sequence} value={product.sequence.toString()}>
                          {product.asin}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-gray-300 font-medium block mb-2">Original Price</label>
                  <Input
                    type="number"
                    value={products.find(p => p.sequence === parseInt(discountSequence))?.price.toFixed(2) || ''}
                    className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                    disabled
                  />
                </div>
                <div>
                  <label className="text-gray-300 font-medium block mb-2">Discounted Price</label>
                  <Input
                    type="number"
                    value={discountPrice}
                    onChange={(e) => {
                      setDiscountPrice(e.target.value);
                      setDiscountPercentage('');
                    }}
                    className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                    placeholder="Enter discounted price"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-gray-300 font-medium block mb-2">Discount Percentage</label>
                  <Select value={discountPercentage} onValueChange={handleDiscountPercentageChange}>
                    <SelectTrigger className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
                      <SelectValue placeholder="Select discount percentage" />
                    </SelectTrigger>
                    <SelectContent>
                      {['5', '10', '20', '25', '30', '40', '50'].map(percentage => (
                        <SelectItem key={percentage} value={percentage}>
                          {percentage}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleDiscountSave}
                    className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => setIsDiscountDialogOpen(false)}
                    className="bg-gray-600 hover:bg-gray-500 text-gray-200"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {allocationResults.length > 0 && (
          <div className="rounded-lg p-6 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] shadow-lg w-full mt-8 overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-300">Allocation Results</h2>
              <Button
                onClick={handleDownloadAllocationResults}
                className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Allocation Results
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">ASIN</TableHead>
                  <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Company</TableHead>
                  <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Quantity</TableHead>
                  <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Price</TableHead>
                  <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Cost Price</TableHead>
                  <TableHead className="text-gray-300 h-12 px-4 text-left align-middle font-medium">Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocationResults.map((result) => (
                  <TableRow key={result.id} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                    <TableCell className="p-4 align-middle text-gray-300">{result.order_products?.asin || 'N/A'}</TableCell>
                    <TableCell className="p-4 align-middle text-gray-300">{result.company?.name || 'Unknown'}</TableCell>
                    <TableCell className="p-4 align-middle text-gray-300">{result.quantity}</TableCell>
                    <TableCell className="p-4 align-middle text-gray-300">{result.order_products?.price ? `$${result.order_products.price.toFixed(2)}` : 'N/A'}</TableCell>
                    <TableCell className="p-4 align-middle text-gray-300">{result.order_products?.cost_price ? `$${result.order_products.cost_price.toFixed(2)}` : 'N/A'}</TableCell>
                    <TableCell className="p-4 align-middle text-gray-300">{result.order_products?.description || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}