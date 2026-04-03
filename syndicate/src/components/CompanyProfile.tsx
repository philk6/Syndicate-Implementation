/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fetchCompanyInfoAndUsers,
  fetchCompanyGoals,
  addCompanyGoal,
  toggleCompanyGoalStatus,
  fetchCompanyPOs,
  addCompanyPOMetadata,
  deleteCompanyPO,
  fetchCompanyNotes,
  addCompanyNote
} from '@/lib/actions/companyProfile';
import { toast } from 'sonner';
import { Loader2, Upload, FileText, Trash2, CheckCircle2, Circle } from 'lucide-react';

interface CompanyProfileProps {
  companyId: number;
  isAdmin: boolean;
}

export function CompanyProfile({ companyId, isAdmin }: CompanyProfileProps) {
  const { user } = useAuth();
  
  // Data states
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  
  // Form states
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [isUploadingPO, setIsUploadingPO] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteIsPublic, setNoteIsPublic] = useState(false);

  const loadData = async () => {
    if (!user?.user_id) return;
    try {
      setLoading(true);
      const [infoRes, goalsRes, posRes, notesRes] = await Promise.all([
        fetchCompanyInfoAndUsers(companyId),
        fetchCompanyGoals(companyId),
        fetchCompanyPOs(companyId),
        fetchCompanyNotes(companyId, user.user_id)
      ]);
      
      setCompanyInfo(infoRes.company);
      setUsers(infoRes.users);
      setGoals(goalsRes);
      setPos(posRes);
      setNotes(notesRes);
    } catch (error: any) {
      toast.error('Failed to load profile data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, user?.user_id]);

  // Handlers
  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.user_id || !goalTitle.trim()) return;
    try {
      await addCompanyGoal(companyId, goalTitle, goalDesc, user.user_id);
      toast.success('Goal added successfully');
      setGoalTitle('');
      setGoalDesc('');
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleToggleGoal = async (goalId: number, isCompleted: boolean) => {
    if (!user?.user_id) return;
    try {
      await toggleCompanyGoalStatus(goalId, isCompleted, user.user_id);
      setGoals(goals.map(g => g.id === goalId ? { ...g, is_completed: isCompleted } : g));
      toast.success(isCompleted ? 'Goal completed!' : 'Goal uncompleted');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUploadPO = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.user_id) return;
    
    setIsUploadingPO(true);
    try {
      const timestamp = Date.now();
      const filePath = `${companyId}/${timestamp}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('company_pos')
        .upload(filePath, file);
        
      if (uploadError) throw new Error(uploadError.message);
      
      await addCompanyPOMetadata(companyId, file.name, filePath, user.user_id);
      toast.success('PO uploaded successfully');
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUploadingPO(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleDeletePO = async (poId: number, filePath: string) => {
    if (!user?.user_id || !confirm('Are you sure you want to delete this PO?')) return;
    try {
      await deleteCompanyPO(poId, filePath, user.user_id);
      setPos(pos.filter(p => p.id !== poId));
      toast.success('PO deleted');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.user_id || !noteTitle.trim()) return;
    try {
      await addCompanyNote(companyId, noteTitle, noteContent, noteIsPublic, user.user_id);
      toast.success('Note added successfully');
      setNoteTitle('');
      setNoteContent('');
      setNoteIsPublic(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const formatName = (u?: any) => {
    if (!u) return 'Unknown';
    if (u.firstname || u.lastname) return `${u.firstname || ''} ${u.lastname || ''}`.trim();
    if (u.users) return `${u.users.firstname || ''} ${u.users.lastname || ''}`.trim();
    return 'Unknown';
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>;
  }

  return (
    <div className="w-full">
      <Tabs defaultValue="info" className="w-full">
        <TabsList className="mb-6 bg-white/[0.05] border border-white/10 p-1 rounded-xl">
          <TabsTrigger value="info" className="rounded-lg data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Info & Users</TabsTrigger>
          <TabsTrigger value="goals" className="rounded-lg data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Goals</TabsTrigger>
          <TabsTrigger value="pos" className="rounded-lg data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Purchase Orders</TabsTrigger>
          <TabsTrigger value="notes" className="rounded-lg data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">Notes</TabsTrigger>
        </TabsList>

        {/* INFO & USERS */}
        <TabsContent value="info" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <GlassCard className="p-6 border-white/5">
            <h3 className="text-xl font-semibold text-white mb-4">Company Details</h3>
            {companyInfo && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-neutral-400">Company ID</p>
                  <p className="font-medium text-white">{companyInfo.company_id}</p>
                </div>
                {/* Additional company specific fields can go here */}
              </div>
            )}
          </GlassCard>

          <GlassCard className="overflow-hidden border-white/5">
            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <h3 className="text-xl font-semibold text-white">Linked Users</h3>
              <p className="text-sm text-neutral-400 mt-1">Users associated with this company.</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-neutral-400">Name</TableHead>
                    <TableHead className="text-neutral-400">Email</TableHead>
                    <TableHead className="text-neutral-400">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow className="border-white/5"><TableCell colSpan={3} className="text-center text-neutral-500 py-8">No users found.</TableCell></TableRow>
                  ) : (
                    users.map(u => (
                      <TableRow key={u.user_id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                        <TableCell className="font-medium text-white">{formatName(u)}</TableCell>
                        <TableCell className="text-neutral-300">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={u.role === 'admin' ? 'text-amber-400 border-amber-500/30' : 'text-neutral-300'}>
                            {u.role}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </GlassCard>
        </TabsContent>

        {/* GOALS */}
        <TabsContent value="goals" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {isAdmin && (
            <GlassCard className="p-6 border-white/5">
              <h3 className="text-lg font-semibold text-white mb-4">Add New Goal</h3>
              <form onSubmit={handleAddGoal} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm text-neutral-400">Goal Title</label>
                    <Input 
                      value={goalTitle} 
                      onChange={e => setGoalTitle(e.target.value)} 
                      placeholder="e.g. Q3 Sales Target"
                      className="bg-black/20 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-amber-500/50"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-neutral-400">Description</label>
                    <Input 
                      value={goalDesc} 
                      onChange={e => setGoalDesc(e.target.value)} 
                      placeholder="Optional details"
                      className="bg-black/20 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-amber-500/50"
                    />
                  </div>
                </div>
                <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                  Create Goal
                </Button>
              </form>
            </GlassCard>
          )}

          <div className="grid gap-4">
            {goals.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 bg-white/[0.02] rounded-xl border border-white/5">No goals set yet.</div>
            ) : (
              goals.map(goal => (
                <div key={goal.id} className={`flex items-start gap-4 p-5 rounded-xl border transition-all duration-300 ${goal.is_completed ? 'bg-green-500/5 border-green-500/20' : 'bg-white/[0.03] border-white/10 hover:border-white/20'}`}>
                  {isAdmin ? (
                    <button onClick={() => handleToggleGoal(goal.id, !goal.is_completed)} className="mt-1 flex-shrink-0 text-white/50 hover:text-amber-400 transition-colors">
                      {goal.is_completed ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <Circle className="w-6 h-6" />}
                    </button>
                  ) : (
                    <div className="mt-1 flex-shrink-0">
                      {goal.is_completed ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <Circle className="w-6 h-6 text-white/30" />}
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className={`text-lg font-medium ${goal.is_completed ? 'text-green-400 line-through opacity-70' : 'text-white'}`}>{goal.title}</h4>
                    {goal.description && <p className={`text-sm mt-1 ${goal.is_completed ? 'text-neutral-500' : 'text-neutral-400'}`}>{goal.description}</p>}
                    <p className="text-xs text-neutral-600 mt-2">Added on {new Date(goal.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* PURCHASE ORDERS */}
        <TabsContent value="pos" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <GlassCard className="p-6 border-white/5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Purchase Orders</h3>
                <p className="text-sm text-neutral-400">Upload and manage PO documents (PDFs, Excel).</p>
              </div>
              <div className="relative">
                <input
                  type="file"
                  id="po-upload"
                  className="hidden"
                  accept=".pdf,.xlsx,.xls,.doc,.docx"
                  onChange={handleUploadPO}
                  disabled={isUploadingPO}
                />
                <label 
                  htmlFor="po-upload"
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border shadow-sm cursor-pointer ${isUploadingPO ? 'bg-neutral-800 text-neutral-400 border-neutral-700' : 'bg-white text-black hover:bg-neutral-200 border-white'}`}
                >
                  {isUploadingPO ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isUploadingPO ? 'Uploading...' : 'Upload File'}
                </label>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="overflow-hidden border-white/5">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-neutral-400">Document</TableHead>
                    <TableHead className="text-neutral-400">Uploaded By</TableHead>
                    <TableHead className="text-neutral-400">Date</TableHead>
                    <TableHead className="text-right text-neutral-400">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pos.length === 0 ? (
                    <TableRow className="border-white/5"><TableCell colSpan={4} className="text-center text-neutral-500 py-8">No purchase orders uploaded.</TableCell></TableRow>
                  ) : (
                    pos.map(po => {
                      const { data: fileData } = supabase.storage.from('company_pos').getPublicUrl(po.file_path);
                      
                      return (
                        <TableRow key={po.id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                                <FileText className="w-5 h-5 text-amber-500" />
                              </div>
                              <span className="font-medium text-white truncate max-w-[200px] md:max-w-[400px]">{po.file_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-neutral-300">{formatName(po)}</TableCell>
                          <TableCell className="text-neutral-400 text-sm whitespace-nowrap">{new Date(po.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" className="bg-black/20 border-white/10 hover:bg-white/10 hover:text-white" asChild>
                                <a href={fileData?.publicUrl} target="_blank" rel="noopener noreferrer">View</a>
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeletePO(po.id, po.file_path)} className="text-red-400 hover:text-red-300 hover:bg-red-400/10">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </GlassCard>
        </TabsContent>

        {/* NOTES */}
        <TabsContent value="notes" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {isAdmin && (
            <GlassCard className="p-6 border-white/5">
              <h3 className="text-lg font-semibold text-white mb-4">Add Note</h3>
              <form onSubmit={handleAddNote} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-neutral-400">Title</label>
                  <Input 
                    value={noteTitle} 
                    onChange={e => setNoteTitle(e.target.value)} 
                    placeholder="Note subject"
                    className="bg-black/20 border-white/10 text-white placeholder:text-neutral-600 focus-visible:ring-amber-500/50"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-neutral-400">Content</label>
                  <Textarea 
                    value={noteContent} 
                    onChange={e => setNoteContent(e.target.value)} 
                    placeholder="Write detailed notes here..."
                    className="bg-black/20 border-white/10 text-white min-h-[100px] placeholder:text-neutral-600 focus-visible:ring-amber-500/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="is-public" 
                    checked={noteIsPublic} 
                    onCheckedChange={(checked) => setNoteIsPublic(checked === true)} 
                    className="border-white/20 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
                  />
                  <label htmlFor="is-public" className="text-sm text-neutral-300 cursor-pointer select-none">
                    Make this note visible to company users
                  </label>
                </div>
                <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                  Save Note
                </Button>
              </form>
            </GlassCard>
          )}

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {notes.length === 0 ? (
              <div className="col-span-full text-center py-12 text-neutral-500 bg-white/[0.02] rounded-xl border border-white/5">
                No notes found.
              </div>
            ) : (
              notes.map(note => (
                <GlassCard key={note.id} className="p-5 flex flex-col h-full border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-lg font-medium text-white line-clamp-1">{note.title}</h4>
                    <Badge variant="outline" className={note.is_public ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-neutral-800 text-neutral-400 border-neutral-700'}>
                      {note.is_public ? 'Public' : 'Private'}
                    </Badge>
                  </div>
                  <div className="text-neutral-300 text-sm whitespace-pre-wrap flex-1 mb-4">
                    {note.content || <span className="text-neutral-600 italic">No content</span>}
                  </div>
                  <div className="pt-4 border-t border-white/5 text-xs flex justify-between text-neutral-500 mt-auto">
                    <span>By {formatName(note)}</span>
                    <span>{new Date(note.created_at).toLocaleString()}</span>
                  </div>
                </GlassCard>
              ))
            )}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
