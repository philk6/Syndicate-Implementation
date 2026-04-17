/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@lib/auth';
import { supabase } from '@lib/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  PageHeader,
  SectionLabel,
  DsCard,
  MetricCard,
  DsStatusPill,
  DsTable,
  DsThead,
  DsTh,
  DsTr,
  DsTd,
  DsButton,
  DsEmpty,
  DsCountPill,
  DsInput,
  DS,
} from '@/components/ui/ds';
import {
  fetchCompanyInfoAndUsers,
  fetchCompanyGoals,
  addCompanyGoal,
  toggleCompanyGoalStatus,
  updateCompanyGoal,
  deleteCompanyGoal,
  fetchCompanyPOs,
  addCompanyPOMetadata,
  deleteCompanyPO,
  fetchCompanyNotes,
  addCompanyNote,
  updateCompanyNote,
  deleteCompanyNote,
} from '@/lib/actions/companyProfile';
import { toast } from 'sonner';
import { Loader2, Upload, FileText, Trash2, CheckCircle2, Circle, Pencil, Users, Target, Package } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface CompanyProfileProps {
  companyId: number;
  isAdmin: boolean;
}

export function CompanyProfile({ companyId, isAdmin }: CompanyProfileProps) {
  const { user } = useAuth();
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);

  const [isUploadingPO, setIsUploadingPO] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteIsPublic, setNoteIsPublic] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);

  // Delete confirm states
  const [deleteDialogItem, setDeleteDialogItem] = useState<{ id: number, type: 'goal' | 'note' | 'po', extraData?: any } | null>(null);

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
      if (editingGoalId) {
        await updateCompanyGoal(editingGoalId, goalTitle, goalDesc, user.user_id);
        toast.success('Goal updated successfully');
        setEditingGoalId(null);
      } else {
        await addCompanyGoal(companyId, goalTitle, goalDesc, user.user_id);
        toast.success('Goal added successfully');
      }
      setGoalTitle('');
      setGoalDesc('');
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteGoal = (goalId: number) => setDeleteDialogItem({ id: goalId, type: 'goal' });

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

  const processFileUpload = async (file: File) => {
    if (!user?.user_id) return;
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
    }
  };

  const handleUploadPO = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFileUpload(file);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFileUpload(file);
  };

  const handleDeletePO = (poId: number, filePath: string) => setDeleteDialogItem({ id: poId, type: 'po', extraData: filePath });

  const handleViewPO = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage.from('company_pos').createSignedUrl(filePath, 3600);
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err: any) {
      toast.error('Failed to open file: ' + err.message);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.user_id || !noteTitle.trim()) return;
    try {
      if (editingNoteId) {
        await updateCompanyNote(editingNoteId, noteTitle, noteContent, noteIsPublic, user.user_id);
        toast.success('Note updated successfully');
        setEditingNoteId(null);
      } else {
        await addCompanyNote(companyId, noteTitle, noteContent, noteIsPublic, user.user_id);
        toast.success('Note added successfully');
      }
      setNoteTitle('');
      setNoteContent('');
      setNoteIsPublic(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteNote = (noteId: number) => setDeleteDialogItem({ id: noteId, type: 'note' });

  const handleConfirmDelete = async () => {
    if (!deleteDialogItem || !user?.user_id) return;
    try {
      const { id, type, extraData } = deleteDialogItem;
      if (type === 'goal') {
        await deleteCompanyGoal(id, user.user_id);
        setGoals(goals.filter(g => g.id !== id));
        toast.success('Goal deleted');
      } else if (type === 'po') {
        await deleteCompanyPO(id, extraData, user.user_id);
        setPos(pos.filter(p => p.id !== id));
        toast.success('PO deleted');
      } else if (type === 'note') {
        await deleteCompanyNote(id, user.user_id);
        setNotes(notes.filter(n => n.id !== id));
        toast.success('Note deleted');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteDialogItem(null);
    }
  };

  const formatName = (u?: any) => {
    if (!u) return 'Unknown';
    if (u.firstname || u.lastname) return `${u.firstname || ''} ${u.lastname || ''}`.trim();
    if (u.users) return `${u.users.firstname || ''} ${u.users.lastname || ''}`.trim();
    return 'Unknown';
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="w-5 h-5" style={{ color: DS.red }} />;
    if (['xlsx', 'xls'].includes(ext || '')) return <FileText className="w-5 h-5" style={{ color: DS.teal }} />;
    if (['doc', 'docx'].includes(ext || '')) return <FileText className="w-5 h-5" style={{ color: DS.blue }} />;
    return <FileText className="w-5 h-5" style={{ color: DS.orange }} />;
  };

  const completedGoals = goals.filter(g => g.is_completed).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: DS.orange }} />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Delete Dialog */}
      <AlertDialog open={!!deleteDialogItem} onOpenChange={(open) => !open && setDeleteDialogItem(null)}>
        <AlertDialogContent style={{ backgroundColor: DS.bg, borderColor: 'rgba(255,255,255,0.1)' }} className="text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono uppercase tracking-wider text-white">Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400 font-sans">
              This action cannot be undone. This will permanently delete the {deleteDialogItem?.type === 'goal' ? 'goal' : deleteDialogItem?.type === 'po' ? 'purchase order' : 'note'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white font-mono text-xs uppercase tracking-wider">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="text-white hover:brightness-110 border font-mono text-xs uppercase tracking-wider"
              style={{ backgroundColor: `${DS.red}22`, borderColor: `${DS.red}55`, color: DS.red }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hero Header */}
      <PageHeader
        label="syndicate"
        title={companyInfo?.name || 'COMPANY'}
        subtitle={companyInfo?.email ? `${companyInfo.email}` : 'Manage your company details, goals, purchase orders, and notes.'}
        accent={DS.orange}
        right={
          <DsStatusPill
            label={companyInfo?.status || 'Active'}
            color={companyInfo?.status === 'inactive' ? DS.red : DS.teal}
          />
        }
      />

      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Members"
          value={users.length}
          sub={`${users.filter(u => u.role === 'admin').length} admin${users.filter(u => u.role === 'admin').length !== 1 ? 's' : ''}`}
          accent={DS.orange}
          icon={<Users className="w-4 h-4" />}
        />
        <MetricCard
          label="Goals"
          value={`${completedGoals}/${goals.length}`}
          sub={goals.length > 0 ? `${Math.round((completedGoals / goals.length) * 100)}% complete` : 'No goals yet'}
          accent={DS.teal}
          icon={<Target className="w-4 h-4" />}
        />
        <MetricCard
          label="Purchase Orders"
          value={pos.length}
          sub={`${notes.length} note${notes.length !== 1 ? 's' : ''} on file`}
          accent={DS.gold}
          icon={<Package className="w-4 h-4" />}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="w-full">
        <TabsList
          className="mb-6 p-1 rounded-xl border"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <TabsTrigger
            value="info"
            className="rounded-lg font-mono text-xs uppercase tracking-wider data-[state=active]:text-white data-[state=active]:shadow-none"
            style={{ '--tw-text-opacity': 1 } as any}
          >
            Info & Users
          </TabsTrigger>
          <TabsTrigger
            value="goals"
            className="rounded-lg font-mono text-xs uppercase tracking-wider data-[state=active]:text-white data-[state=active]:shadow-none"
          >
            Goals <DsCountPill count={goals.length} accent={DS.teal} />
          </TabsTrigger>
          <TabsTrigger
            value="pos"
            className="rounded-lg font-mono text-xs uppercase tracking-wider data-[state=active]:text-white data-[state=active]:shadow-none"
          >
            Purchase Orders <DsCountPill count={pos.length} accent={DS.gold} />
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="rounded-lg font-mono text-xs uppercase tracking-wider data-[state=active]:text-white data-[state=active]:shadow-none"
          >
            Notes <DsCountPill count={notes.length} accent={DS.orange} />
          </TabsTrigger>
        </TabsList>

        {/* ─── INFO & USERS ──────────────────────────────────────────── */}
        <TabsContent value="info" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <SectionLabel accent={DS.orange}>Company Details</SectionLabel>
          <DsCard className="p-6">
            {companyInfo && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 font-mono">Company ID</p>
                  <p className="text-white font-mono text-lg font-black" style={{ color: DS.orange }}>{companyInfo.company_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 font-mono">Company Name</p>
                  <p className="text-white font-sans text-lg font-semibold">{companyInfo.name || 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 font-mono">Contact Email</p>
                  <p className="text-white font-sans text-lg">{companyInfo.email || 'N/A'}</p>
                </div>
              </div>
            )}
          </DsCard>

          <SectionLabel accent={DS.orange}>
            Linked Users
          </SectionLabel>
          <DsTable>
            <DsThead>
              <DsTh>Name</DsTh>
              <DsTh>Email</DsTh>
              <DsTh>Role</DsTh>
            </DsThead>
            <tbody>
              {users.length === 0 ? (
                <tr className="border-b border-white/[0.03]">
                  <td colSpan={3} className="text-center text-neutral-500 py-8 text-xs">No users found.</td>
                </tr>
              ) : (
                users.map(u => (
                  <DsTr key={u.user_id}>
                    <DsTd className="font-semibold text-white">{formatName(u)}</DsTd>
                    <DsTd>{u.email}</DsTd>
                    <DsTd>
                      <DsStatusPill
                        label={u.role}
                        color={u.role === 'admin' ? DS.orange : DS.muted}
                      />
                    </DsTd>
                  </DsTr>
                ))
              )}
            </tbody>
          </DsTable>
        </TabsContent>

        {/* ─── GOALS ─────────────────────────────────────────────────── */}
        <TabsContent value="goals" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Progress bar */}
          {goals.length > 0 && (
            <DsCard className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 font-mono">Overall Progress</span>
                <span className="text-sm font-black font-mono" style={{ color: DS.teal }}>
                  {completedGoals}/{goals.length}
                </span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${goals.length > 0 ? (completedGoals / goals.length) * 100 : 0}%`,
                    backgroundColor: DS.teal,
                    boxShadow: `0 0 12px ${DS.teal}66`,
                  }}
                />
              </div>
            </DsCard>
          )}

          {isAdmin && (
            <>
              <SectionLabel accent={DS.teal}>{editingGoalId ? 'Edit Goal' : 'Add New Goal'}</SectionLabel>
              <DsCard className="p-6">
                <form onSubmit={handleAddGoal} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <DsInput
                      label="Goal Title"
                      value={goalTitle}
                      onChange={setGoalTitle}
                      placeholder="e.g. Q3 Sales Target"
                      required
                    />
                    <DsInput
                      label="Description"
                      value={goalDesc}
                      onChange={setGoalDesc}
                      placeholder="Optional details"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <DsButton type="submit" accent={DS.teal}>
                      {editingGoalId ? 'Save Changes' : 'Create Goal'}
                    </DsButton>
                    {editingGoalId && (
                      <DsButton variant="ghost" onClick={() => { setEditingGoalId(null); setGoalTitle(''); setGoalDesc(''); }}>
                        Cancel
                      </DsButton>
                    )}
                  </div>
                </form>
              </DsCard>
            </>
          )}

          <SectionLabel accent={DS.teal}>Goals</SectionLabel>
          <div className="grid gap-3">
            {goals.length === 0 ? (
              <DsEmpty
                icon={<Target className="w-7 h-7" />}
                title="No Goals Yet"
                body="Set company goals to track progress and keep your team aligned."
              />
            ) : (
              goals.map(goal => (
                <DsCard
                  key={goal.id}
                  className="group relative"
                  accent={goal.is_completed ? DS.teal : undefined}
                  glow={goal.is_completed}
                >
                  <div className="flex items-start gap-4 p-5">
                    {/* Checkbox / toggle */}
                    {isAdmin ? (
                      <button
                        onClick={() => handleToggleGoal(goal.id, !goal.is_completed)}
                        className="mt-0.5 flex-shrink-0 transition-all duration-300"
                        style={{ color: goal.is_completed ? DS.teal : 'rgba(255,255,255,0.25)' }}
                      >
                        {goal.is_completed ? (
                          <CheckCircle2 className="w-6 h-6" style={{ filter: `drop-shadow(0 0 6px ${DS.teal})` }} />
                        ) : (
                          <Circle className="w-6 h-6 hover:text-white/60" />
                        )}
                      </button>
                    ) : (
                      <div className="mt-0.5 flex-shrink-0" style={{ color: goal.is_completed ? DS.teal : 'rgba(255,255,255,0.2)' }}>
                        {goal.is_completed ? (
                          <CheckCircle2 className="w-6 h-6" style={{ filter: `drop-shadow(0 0 6px ${DS.teal})` }} />
                        ) : (
                          <Circle className="w-6 h-6" />
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className={`text-base font-semibold font-sans transition-all ${goal.is_completed ? 'line-through opacity-60' : 'text-white'}`}
                            style={goal.is_completed ? { color: DS.teal } : undefined}
                          >
                            {goal.title}
                          </h4>
                          {goal.description && (
                            <p className={`text-sm mt-1 font-sans ${goal.is_completed ? 'text-neutral-600' : 'text-neutral-400'}`}>
                              {goal.description}
                            </p>
                          )}
                          <p className="text-[10px] text-neutral-600 mt-2 font-mono uppercase tracking-wider">
                            Added {new Date(goal.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingGoalId(goal.id); setGoalTitle(goal.title); setGoalDesc(goal.description || ''); }}
                              className="p-1.5 text-neutral-600 hover:text-white transition-colors"
                              title="Edit Goal"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteGoal(goal.id)}
                              className="p-1.5 transition-colors"
                              style={{ color: DS.muted }}
                              onMouseEnter={e => { e.currentTarget.style.color = DS.red; }}
                              onMouseLeave={e => { e.currentTarget.style.color = DS.muted; }}
                              title="Delete Goal"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </DsCard>
              ))
            )}
          </div>
        </TabsContent>

        {/* ─── PURCHASE ORDERS ───────────────────────────────────────── */}
        <TabsContent value="pos" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <SectionLabel accent={DS.gold}>Upload Purchase Order</SectionLabel>

          {/* Drag & Drop Zone */}
          <DsCard className="p-0 overflow-hidden">
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center py-12 px-6 cursor-pointer transition-all duration-300"
              style={{
                backgroundColor: isDragOver ? `${DS.gold}11` : 'transparent',
                borderTop: 'none',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xls,.doc,.docx"
                onChange={handleUploadPO}
                disabled={isUploadingPO}
              />
              <div
                className="w-16 h-16 rounded-2xl border-2 border-dashed flex items-center justify-center mb-4 transition-all duration-300"
                style={{
                  borderColor: isDragOver ? DS.gold : 'rgba(255,255,255,0.1)',
                  backgroundColor: isDragOver ? `${DS.gold}1a` : 'rgba(255,255,255,0.02)',
                }}
              >
                {isUploadingPO ? (
                  <Loader2 className="w-7 h-7 animate-spin" style={{ color: DS.gold }} />
                ) : (
                  <Upload className="w-7 h-7" style={{ color: isDragOver ? DS.gold : DS.muted }} />
                )}
              </div>
              <p className="text-sm font-semibold text-white font-sans mb-1">
                {isUploadingPO ? 'Uploading...' : 'Drop files here or click to upload'}
              </p>
              <p className="text-[10px] uppercase tracking-widest font-mono text-neutral-500">
                PDF, Excel, Word documents accepted
              </p>
            </div>
          </DsCard>

          <SectionLabel accent={DS.gold}>Documents</SectionLabel>
          {pos.length === 0 ? (
            <DsEmpty
              icon={<Package className="w-7 h-7" />}
              title="No Purchase Orders"
              body="Upload PO documents to keep them organized and accessible."
            />
          ) : (
            <DsTable>
              <DsThead>
                <DsTh>Document</DsTh>
                <DsTh>Uploaded By</DsTh>
                <DsTh>Date</DsTh>
                <DsTh className="text-right">Actions</DsTh>
              </DsThead>
              <tbody>
                {pos.map(po => (
                  <DsTr key={po.id}>
                    <DsTd>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `${DS.orange}1a`,
                            borderColor: `${DS.orange}44`,
                          }}
                        >
                          {getFileIcon(po.file_name)}
                        </div>
                        <span className="font-medium text-white truncate max-w-[200px] md:max-w-[400px] font-sans text-sm">
                          {po.file_name}
                        </span>
                      </div>
                    </DsTd>
                    <DsTd>{formatName(po)}</DsTd>
                    <DsTd className="text-neutral-500 whitespace-nowrap">{new Date(po.created_at).toLocaleString()}</DsTd>
                    <DsTd className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <DsButton variant="secondary" accent={DS.gold} onClick={() => handleViewPO(po.file_path)}>
                          View
                        </DsButton>
                        <button
                          onClick={() => handleDeletePO(po.id, po.file_path)}
                          className="p-2 rounded-lg transition-all"
                          style={{ color: DS.muted }}
                          onMouseEnter={e => { e.currentTarget.style.color = DS.red; e.currentTarget.style.backgroundColor = `${DS.red}1a`; }}
                          onMouseLeave={e => { e.currentTarget.style.color = DS.muted; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </DsTd>
                  </DsTr>
                ))}
              </tbody>
            </DsTable>
          )}
        </TabsContent>

        {/* ─── NOTES ─────────────────────────────────────────────────── */}
        <TabsContent value="notes" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {isAdmin && (
            <>
              <SectionLabel accent={DS.orange}>{editingNoteId ? 'Edit Note' : 'Add Note'}</SectionLabel>
              <DsCard className="p-6">
                <form onSubmit={handleAddNote} className="space-y-4">
                  <DsInput
                    label="Title"
                    value={noteTitle}
                    onChange={setNoteTitle}
                    placeholder="Note subject"
                    required
                  />
                  <div className="space-y-1">
                    <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 font-mono mb-1">Content</span>
                    <textarea
                      value={noteContent}
                      onChange={e => setNoteContent(e.target.value)}
                      placeholder="Write detailed notes here..."
                      rows={5}
                      className="w-full text-sm text-white border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 placeholder-neutral-600 resize-y font-sans"
                      style={{
                        backgroundColor: DS.inputBg,
                        borderColor: 'rgba(255,255,255,0.1)',
                      }}
                      onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 2px ${DS.orange}44`; }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="is-public"
                      checked={noteIsPublic}
                      onCheckedChange={(checked) => setNoteIsPublic(checked === true)}
                      className="border-white/20 data-[state=checked]:bg-[#FF6B35] data-[state=checked]:text-black data-[state=checked]:border-[#FF6B35]"
                    />
                    <label htmlFor="is-public" className="text-sm text-neutral-400 cursor-pointer select-none font-sans">
                      Make this note visible to company users
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <DsButton type="submit" accent={DS.orange}>
                      {editingNoteId ? 'Save Changes' : 'Save Note'}
                    </DsButton>
                    {editingNoteId && (
                      <DsButton variant="ghost" onClick={() => { setEditingNoteId(null); setNoteTitle(''); setNoteContent(''); setNoteIsPublic(false); }}>
                        Cancel
                      </DsButton>
                    )}
                  </div>
                </form>
              </DsCard>
            </>
          )}

          <SectionLabel accent={DS.orange}>Notes</SectionLabel>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {notes.length === 0 ? (
              <div className="col-span-full">
                <DsEmpty
                  icon={<FileText className="w-7 h-7" />}
                  title="No Notes"
                  body="Add notes to keep important information about this company."
                />
              </div>
            ) : (
              notes.map(note => (
                <DsCard key={note.id} className="group flex flex-col h-full">
                  <div className="p-5 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="text-base font-semibold text-white line-clamp-1 pr-2 font-sans">{note.title}</h4>
                      <div className="flex items-center gap-2 shrink-0">
                        {isAdmin && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingNoteId(note.id); setNoteTitle(note.title); setNoteContent(note.content || ''); setNoteIsPublic(note.is_public); }}
                              className="p-1 text-neutral-600 hover:text-white transition-colors"
                              title="Edit Note"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1 transition-colors"
                              style={{ color: DS.muted }}
                              onMouseEnter={e => { e.currentTarget.style.color = DS.red; }}
                              onMouseLeave={e => { e.currentTarget.style.color = DS.muted; }}
                              title="Delete Note"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <DsStatusPill
                          label={note.is_public ? 'Public' : 'Private'}
                          color={note.is_public ? DS.blue : DS.muted}
                        />
                      </div>
                    </div>
                    <div className="text-neutral-300 text-sm whitespace-pre-wrap flex-1 mb-4 font-sans">
                      {note.content || <span className="text-neutral-600 italic">No content</span>}
                    </div>
                    <div className="pt-3 border-t border-white/[0.06] text-[10px] font-mono uppercase tracking-wider flex justify-between text-neutral-600 mt-auto">
                      <span>By {formatName(note)}</span>
                      <span>{new Date(note.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </DsCard>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
