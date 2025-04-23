'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { PostgrestError } from '@supabase/supabase-js';
import Link from 'next/link';
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
import { Trash2, Upload } from 'lucide-react';

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

    // Get current user ID from Supabase Auth
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      console.error('Error fetching auth user:', authError);
      setUploadMessage('Could not verify user. Please try again.');
      return;
    }
    const userId = authUser.id;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // const fileExt = selectedFile.name.split('.').pop();
    const fileName = `${timestamp}_${selectedFile.name}`;
    const filePath = `receipts/order_${orderId}/company_${selectedCompanyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, selectedFile);

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      setUploadMessage('Failed to upload file: ' + uploadError.message);
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
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setSelectedCompanyId(null);
    }
  };

  const handleViewReceipt = async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('receipts')
      .createSignedUrl(filePath, 60);

    if (error) {
      console.error('Error generating signed URL:', error);
      alert('Failed to generate receipt URL.');
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
      alert('Failed to delete receipt.');
    } else {
      setReceipts(prev => prev.filter(r => r.receipt_id !== receiptId));
      await supabase.storage.from('receipts').remove([filePath]);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-background p-6 w-full">
      <div className="w-full">
        <Link href={`/admin/orders/${orderId}`} className="text-[#c8aa64] hover:text-[#9d864e] mb-6 inline-block">
          ← Back to Order #{orderId}
        </Link>
        <h1 className="text-3xl font-bold text-[#bfbfbf] mb-6">Manage Receipts for Order #{orderId}</h1>
        <div className="rounded-lg p-6 bg-gradient-to-br from-[#212121] via-[#0f0f0f] to-[#2b2b2b] shadow-lg w-full overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-300">Company Receipts</h2>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]">
                  <Upload className="mr-2 h-4 w-4" /> Upload Receipt
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]">
                <DialogHeader>
                  <DialogTitle>Upload Receipt</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-gray-300 font-medium block mb-2">Company</label>
                    <select
                      value={selectedCompanyId || ''}
                      onChange={(e) => setSelectedCompanyId(parseInt(e.target.value))}
                      className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80] rounded px-3 py-2 w-full"
                    >
                      <option value="">Select a company</option>
                      {companies.map(company => (
                        <option key={company.company_id} value={company.company_id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-300 font-medium block mb-2">Receipt File</label>
                    <Input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileChange}
                      className="bg-[#1f1f1f] text-gray-300 border-[#6a6a6a80]"
                    />
                  </div>
                  <Button
                    onClick={handleUpload}
                    className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                  >
                    Upload
                  </Button>
                  {uploadMessage && (
                    <p className={`text-sm ${uploadMessage.includes('successfully') ? 'text-green-400' : 'text-red-400'}`}>
                      {uploadMessage}
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {companies.length === 0 ? (
            <p className="text-gray-400">No companies have applied for this order.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-gray-300">Company</TableHead>
                  <TableHead className="text-gray-300">Max Investment ($)</TableHead>
                  <TableHead className="text-gray-300">Receipt</TableHead>
                  <TableHead className="text-gray-300">Uploaded At</TableHead>
                  <TableHead className="text-gray-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => {
                  const companyReceipt = receipts.find(r => r.company_id === company.company_id);
                  return (
                    <TableRow key={company.company_id} className="hover:bg-[#35353580] transition-colors border-[#6a6a6a80]">
                      <TableCell className="text-gray-200">{company.name}</TableCell>
                      <TableCell className="text-gray-200">${company.max_investment.toLocaleString()}</TableCell>
                      <TableCell className="text-gray-200">
                        {companyReceipt ? companyReceipt.file_name : 'No receipt uploaded'}
                      </TableCell>
                      <TableCell className="text-gray-200">
                        {companyReceipt ? new Date(companyReceipt.uploaded_at).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className="text-gray-200">
                        {companyReceipt ? (
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleViewReceipt(companyReceipt.file_path)}
                              className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                            >
                              View
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteReceipt(companyReceipt.receipt_id, companyReceipt.file_path)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={() => {
                              setSelectedCompanyId(company.company_id);
                              setUploadDialogOpen(true);
                            }}
                            className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424]"
                          >
                            Upload
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}