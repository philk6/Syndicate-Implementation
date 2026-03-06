'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
import { CalendarIcon, Download, Trash2, Plus, Percent, Save, Edit, XCircle, CheckCircle, ListPlus, Search, TrendingUp, PackageSearch, DollarSign, Info, Clock, Upload, ArrowLeft, FileText } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Company {
  company_id: number;
  name: string;
  max_investment: number;
}

interface OrderCompanyQueryResult {
  company_id: number;
  max_investment: number;
  company: { name: string } | null;
}

interface Receipt {
  receipt_id: number;
  order_id: number;
  company_id: number;
  file_path: string;
  file_name: string;
  uploaded_at: string;
}

export default function AdminOrderReceiptsPage() {
  const params = useParams();
  const orderId = parseInt(params.order_id as string);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated || user?.role !== 'admin') {
        router.push('/login');
        return;
      }
      async function fetchData() {
        setLoading(true);

        const { data: companyData, error: companyError } = await supabase
          .from('order_company')
          .select('company_id, company(name), max_investment')
          .eq('order_id', orderId) as { data: OrderCompanyQueryResult[] | null, error: PostgrestError | null };

        if (companyError) {
          console.error('Error fetching companies:', companyError);
        } else {
          setCompanies(companyData?.map(c => ({
            company_id: c.company_id,
            name: c.company?.name || 'Unknown',
            max_investment: c.max_investment,
          })) || []);
        }

        const { data: receiptData, error: receiptError } = await supabase
          .from('order_receipts')
          .select('receipt_id, order_id, company_id, file_path, file_name, uploaded_at')
          .eq('order_id', orderId);

        if (receiptError) {
          console.error('Error fetching receipts:', receiptError);
        } else {
          setReceipts(receiptData || []);
        }

        setLoading(false);
      }
      fetchData();
    }
  }, [orderId, isAuthenticated, authLoading, router, user]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        setUploadMessage('Invalid file type. Please upload PDF, PNG, JPG, or JPEG.');
        setSelectedFile(null);
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setUploadMessage('File size exceeds 100MB limit.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setUploadMessage('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedCompanyId) {
      setUploadMessage('Please select a file and company.');
      return;
    }

    setIsUploading(true);
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      console.error('Error fetching auth user:', authError);
      setUploadMessage('Could not verify user. Please try again.');
      setIsUploading(false);
      return;
    }
    const userId = authUser.id;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}_${selectedFile.name}`;
    const filePath = `receipts/order_${orderId}/company_${selectedCompanyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, selectedFile);

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      setUploadMessage('Failed to upload file: ' + uploadError.message);
      setIsUploading(false);
      return;
    }

    const { data: insertData, error: insertError } = await supabase
      .from('order_receipts')
      .insert({
        order_id: orderId,
        company_id: selectedCompanyId,
        file_path: filePath,
        file_name: selectedFile.name,
        uploaded_by: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error saving receipt metadata:', insertError);
      setUploadMessage('Failed to save receipt metadata.');
      await supabase.storage.from('receipts').remove([filePath]);
    } else {
      setReceipts(prev => [...prev, insertData]);
      setUploadMessage('Receipt uploaded successfully!');
      setTimeout(() => setUploadDialogOpen(false), 1500);
      setSelectedFile(null);
      setSelectedCompanyId(null);
    }
    setIsUploading(false);
  };

  const handleViewReceipt = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(filePath, 60);

    if (error) {
      console.error('Error generating signed URL:', error);
    } else {
      window.open(data.signedUrl, '_blank');
    }
  };

  const handleDeleteReceipt = async (receiptId: number, filePath: string) => {
    if (!confirm('Are you sure you want to delete this receipt?')) return;

    const { error: deleteError } = await supabase
      .from('order_receipts')
      .delete()
      .eq('receipt_id', receiptId);

    if (deleteError) {
      console.error('Error deleting receipt:', deleteError);
    } else {
      setReceipts(prev => prev.filter(r => r.receipt_id !== receiptId));
      await supabase.storage.from('receipts').remove([filePath]);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
          <p className="text-neutral-500 animate-pulse">Loading certificates...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen p-6 w-full relative">
      <div className="max-w-7xl mx-auto z-10 relative">
        <Link
          href={`/admin/orders/${orderId}`}
          className="text-neutral-400 hover:text-white transition-colors text-sm flex items-center mb-6 w-fit"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Order #{orderId}
        </Link>

        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Manage Receipts
          </h1>
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-t from-amber-700/50 to-amber-500/80 hover:from-amber-700/70 hover:to-amber-500 text-white border border-amber-500/20 shadow-lg shadow-amber-900/20 rounded-xl">
                <Upload className="mr-2 h-4 w-4" /> Upload Receipt
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0a0a0a]/90 backdrop-blur-xl border-white/[0.08] text-white">
              <DialogHeader>
                <DialogTitle>Upload Receipt</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                <div>
                  <label className="text-neutral-400 font-medium block mb-2 text-sm italic">Assign to Company</label>
                  <select
                    value={selectedCompanyId || ''}
                    onChange={(e) => setSelectedCompanyId(parseInt(e.target.value))}
                    className="bg-white/[0.02] text-white border border-white/[0.05] rounded-xl px-4 py-2.5 w-full focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all appearance-none"
                  >
                    <option value="" className="bg-[#0a0a0a]">Select a company</option>
                    {companies.map(company => (
                      <option key={company.company_id} value={company.company_id} className="bg-[#0a0a0a]">
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-neutral-400 font-medium block mb-2 text-sm italic">Receipt File (PDF, PNG, JPG)</label>
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                    className="bg-white/[0.02] text-white border-white/[0.05] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-500/10 file:text-amber-500 hover:file:bg-amber-500/20 transition-all cursor-pointer h-auto py-2"
                  />
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading || !selectedFile || !selectedCompanyId}
                  className="w-full bg-gradient-to-t from-amber-700/50 to-amber-500/80 hover:from-amber-700/70 hover:to-amber-500 text-white border border-amber-500/20 shadow-lg rounded-xl"
                >
                  {isUploading ? 'Uploading...' : 'Confirm Upload'}
                </Button>
                {uploadMessage && (
                  <div className={`p-3 rounded-lg text-sm text-center ${uploadMessage.includes('successfully') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {uploadMessage}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <GlassCard className="p-0 overflow-hidden">
          <div className="p-6 border-b border-white/[0.05]">
            <h2 className="text-lg font-semibold text-white flex items-center">
              <FileText className="mr-2 h-5 w-5 text-amber-500" />
              Company Receipts
            </h2>
          </div>
          {companies.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 italic">
              No companies have applied for this order.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-white/[0.05]">
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Company</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Investment</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Receipt Filename</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6">Uploaded At</TableHead>
                    <TableHead className="text-neutral-400 font-medium py-4 px-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => {
                    const companyReceipt = receipts.find(r => r.company_id === company.company_id);
                    return (
                      <TableRow key={company.company_id} className="hover:bg-white/[0.02] transition-colors border-white/[0.02]">
                        <TableCell className="py-4 px-6 font-medium text-white">{company.name}</TableCell>
                        <TableCell className="py-4 px-6 text-neutral-400">${company.max_investment.toLocaleString()}</TableCell>
                        <TableCell className="py-4 px-6">
                          {companyReceipt ? (
                            <span className="text-neutral-300 flex items-center">
                              <FileText className="h-3 w-3 mr-2 text-amber-500/50" />
                              {companyReceipt.file_name}
                            </span>
                          ) : (
                            <span className="text-neutral-600 text-sm italic">Pending upload</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 px-6 text-neutral-500 text-sm">
                          {companyReceipt ? (
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-2" />
                              {new Date(companyReceipt.uploaded_at).toLocaleDateString()}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="py-4 px-6 text-right">
                          {companyReceipt ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleViewReceipt(companyReceipt.file_path)}
                                className="bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/[0.1]"
                              >
                                View
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteReceipt(companyReceipt.receipt_id, companyReceipt.file_path)}
                                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedCompanyId(company.company_id);
                                setUploadDialogOpen(true);
                              }}
                              className="bg-white/[0.05] hover:bg-white/[0.1] text-amber-500 border border-amber-500/20"
                            >
                              <Upload className="h-4 w-4 mr-2" /> Upload
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}