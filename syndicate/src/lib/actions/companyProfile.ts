'use server';

import { createClient } from '@supabase/supabase-js';

const getSupabaseService = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
};

async function verifyAdmin(userId: string) {
  const supabase = getSupabaseService();
  const { data, error } = await supabase.from('users').select('role').eq('user_id', userId).single();
  if (error || data?.role !== 'admin') {
    throw new Error('Unauthorized: Admin access required');
  }
}

// -------------------------------------------------------------
// Users & Company Info
// -------------------------------------------------------------
export async function fetchCompanyInfoAndUsers(companyId: number) {
  const supabase = getSupabaseService();
  
  const { data: company, error: companyErr } = await supabase
    .from('company')
    .select('*')
    .eq('company_id', companyId)
    .single();
    
  if (companyErr) throw new Error(companyErr.message);

  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('user_id, firstname, lastname, email, role')
    .eq('company_id', companyId);

  if (usersErr) throw new Error(usersErr.message);

  return { company, users };
}

// -------------------------------------------------------------
// Goals
// -------------------------------------------------------------
export async function fetchCompanyGoals(companyId: number) {
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from('company_goals')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function addCompanyGoal(companyId: number, title: string, description: string, adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('company_goals').insert({ 
    company_id: companyId, 
    title, 
    description 
  });
  if (error) throw new Error(error.message);
}

export async function toggleCompanyGoalStatus(goalId: number, isCompleted: boolean, adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('company_goals').update({ is_completed: isCompleted }).eq('id', goalId);
  if (error) throw new Error(error.message);
}

export async function updateCompanyGoal(goalId: number, title: string, description: string, adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('company_goals').update({ title, description }).eq('id', goalId);
  if (error) throw new Error(error.message);
}

export async function deleteCompanyGoal(goalId: number, adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('company_goals').delete().eq('id', goalId);
  if (error) throw new Error(error.message);
}

// -------------------------------------------------------------
// POs
// -------------------------------------------------------------
export async function fetchCompanyPOs(companyId: number) {
  const supabase = getSupabaseService();
  const { data, error } = await supabase
    .from('company_pos')
    .select('*, users(firstname, lastname)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function addCompanyPOMetadata(companyId: number, fileName: string, filePath: string, userId: string) {
  const supabase = getSupabaseService();
  const { data: user } = await supabase.from('users').select('company_id, role').eq('user_id', userId).single();
  
  if (!user || (user.role !== 'admin' && user.company_id !== companyId)) {
    throw new Error('Unauthorized');
  }

  const { error } = await supabase.from('company_pos').insert({
    company_id: companyId,
    file_name: fileName,
    file_path: filePath,
    uploaded_by: userId
  });
  if (error) throw new Error(error.message);
}

export async function deleteCompanyPO(poId: number, filePath: string, userId: string) {
  const supabase = getSupabaseService();
  const { data: user } = await supabase.from('users').select('company_id, role').eq('user_id', userId).single();
  const { data: po } = await supabase.from('company_pos').select('company_id').eq('id', poId).single();
  
  if (!user || !po || (user.role !== 'admin' && user.company_id !== po.company_id)) {
    throw new Error('Unauthorized');
  }

  // Remove file from storage
  const { error: storageError } = await supabase.storage.from('company_pos').remove([filePath]);
  if (storageError) console.error('Failed to remove storage file:', storageError);
  
  // Remove from DB
  const { error } = await supabase.from('company_pos').delete().eq('id', poId);
  if (error) throw new Error(error.message);
}

// -------------------------------------------------------------
// Notes
// -------------------------------------------------------------
export async function fetchCompanyNotes(companyId: number, userId: string) {
  const supabase = getSupabaseService();
  const { data: user } = await supabase.from('users').select('role').eq('user_id', userId).single();
  
  let query = supabase
    .from('company_notes')
    .select('*, users(firstname, lastname)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  
  if (user?.role !== 'admin') {
    query = query.eq('is_public', true);
  }
  
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function addCompanyNote(companyId: number, title: string, content: string, isPublic: boolean, adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('company_notes').insert({
    company_id: companyId,
    title,
    content,
    is_public: isPublic,
    created_by: adminUserId
  });
  if (error) throw new Error(error.message);
}

export async function updateCompanyNote(noteId: number, title: string, content: string, isPublic: boolean, adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('company_notes').update({
    title,
    content,
    is_public: isPublic
  }).eq('id', noteId);
  if (error) throw new Error(error.message);
}

export async function deleteCompanyNote(noteId: number, adminUserId: string) {
  await verifyAdmin(adminUserId);
  const supabase = getSupabaseService();
  const { error } = await supabase.from('company_notes').delete().eq('id', noteId);
  if (error) throw new Error(error.message);
}
