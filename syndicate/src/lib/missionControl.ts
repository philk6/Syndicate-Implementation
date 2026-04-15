import { supabase } from '@lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MissionType = 'core' | 'milestone' | 'weekly' | 'bonus';

export interface Phase {
  id: number;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  always_available: boolean;
}

export interface Rank {
  id: number;
  name: string;
  min_xp: number;
  color: string;
  sort_order: number;
}

export interface TaskProgress {
  id: number;
  status: 'pending' | 'submitted' | 'approved' | 'rejected';
}

export interface Task {
  id: number;
  mission_id: number;
  title: string;
  description: string | null;
  order_index: number;
  xp_reward: number;
  auto_complete: boolean;
  progress: TaskProgress | null;
}

export interface Mission {
  id: number;
  title: string;
  description: string | null;
  phase_id: number | null;
  mission_type: MissionType;
  badge_name: string | null;
  sort_order: number;
  target_audience: string;
  tasks: Task[];
}

export interface UserBadge {
  id: number;
  mission_id: number;
  badge_name: string;
  earned_at: string;
}

export interface BonusXpEvent {
  id: number;
  phase_id: number | null;
  code: string;
  description: string;
  xp_reward: number;
  is_repeatable: boolean;
}

export interface MissionControlData {
  phases: Phase[];
  ranks: Rank[];
  missions: Mission[];
  bonusEvents: BonusXpEvent[];
  badges: UserBadge[];
  totalXp: number;
}

// ─── RPC wrappers ─────────────────────────────────────────────────────────────

export async function completeTask(taskId: number) {
  const { data, error } = await supabase
    .rpc('complete_task', { p_task_id: taskId })
    .single<{ awarded_xp: number; badge_earned: string | null }>();

  if (error) throw error;
  return data ?? { awarded_xp: 0, badge_earned: null };
}

export async function uncompleteTask(taskId: number) {
  const { data, error } = await supabase
    .rpc('uncomplete_task', { p_task_id: taskId })
    .single<{ reversed_xp: number }>();

  if (error) throw error;
  return data ?? { reversed_xp: 0 };
}

export async function claimBonusXp(
  eventCode: string,
  metadata?: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .rpc('claim_bonus_xp', {
      p_event_code: eventCode,
      p_metadata: metadata ?? null,
    })
    .single<{ awarded_xp: number }>();

  if (error) throw error;
  return data ?? { awarded_xp: 0 };
}

// ─── Bulk loader ──────────────────────────────────────────────────────────────

export async function getMissionControlData(
  userId: string,
): Promise<MissionControlData> {
  const [
    phasesRes,
    ranksRes,
    missionsRes,
    bonusRes,
    badgesRes,
    xpRes,
  ] = await Promise.all([
    supabase.from('phases').select('*').order('sort_order'),
    supabase.from('ranks').select('*').order('sort_order'),
    supabase
      .from('missions')
      .select('id, title, description, phase_id, mission_type, badge_name, sort_order, target_audience, is_active')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('bonus_xp_events').select('*').eq('is_active', true),
    supabase.from('user_badges').select('id, mission_id, badge_name, earned_at').eq('user_id', userId),
    supabase.from('xp_transactions').select('amount').eq('user_id', userId),
  ]);

  const phases = (phasesRes.data ?? []) as Phase[];
  const ranks = (ranksRes.data ?? []) as Rank[];
  const bonusEvents = (bonusRes.data ?? []) as BonusXpEvent[];
  const badges = (badgesRes.data ?? []) as UserBadge[];
  const totalXp = (xpRes.data ?? []).reduce(
    (sum: number, r: { amount: number }) => sum + r.amount,
    0,
  );

  const missionRows = missionsRes.data ?? [];
  const missionIds = missionRows.map((m: { id: number }) => m.id);

  if (missionIds.length === 0) {
    return { phases, ranks, missions: [], bonusEvents, badges, totalXp };
  }

  const [tasksRes, progressRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, mission_id, title, description, order_index, xp_reward, auto_complete')
      .in('mission_id', missionIds)
      .order('order_index'),
    supabase
      .from('user_task_progress')
      .select('id, task_id, status')
      .eq('user_id', userId),
  ]);

  const taskRows = tasksRes.data ?? [];
  const progressByTask = new Map<number, TaskProgress>();
  for (const p of progressRes.data ?? []) {
    progressByTask.set(p.task_id, { id: p.id, status: p.status });
  }

  const tasksByMission = new Map<number, Task[]>();
  for (const t of taskRows) {
    const list = tasksByMission.get(t.mission_id) ?? [];
    list.push({
      id: t.id,
      mission_id: t.mission_id,
      title: t.title,
      description: t.description,
      order_index: t.order_index,
      xp_reward: t.xp_reward,
      auto_complete: t.auto_complete,
      progress: progressByTask.get(t.id) ?? null,
    });
    tasksByMission.set(t.mission_id, list);
  }

  const missions: Mission[] = missionRows.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    phase_id: m.phase_id,
    mission_type: m.mission_type,
    badge_name: m.badge_name,
    sort_order: m.sort_order,
    target_audience: m.target_audience,
    tasks: tasksByMission.get(m.id) ?? [],
  }));

  return { phases, ranks, missions, bonusEvents, badges, totalXp };
}
