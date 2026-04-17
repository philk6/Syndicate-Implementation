'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@lib/supabase/client';
import { getMyUnreadNotificationCount } from '@/lib/actions/prep';

/**
 * Subscribes to the caller's prep_notifications rows and returns a live
 * unread count. Uses Supabase realtime `postgres_changes` subscription
 * filtered by user_id, with a 60-second polling fallback for environments
 * where the realtime publication isn't delivering events.
 */
export function usePrepUnreadCount(userId: string | null | undefined): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const n = await getMyUnreadNotificationCount(userId);
      setCount(n);
    } catch {
      /* swallow — badge isn't critical */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();

    // Realtime subscription
    const channel = supabase
      .channel(`prep-notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prep_notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refresh();
        },
      )
      .subscribe();

    // Fallback poll
    const interval = window.setInterval(refresh, 60000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
    };
  }, [userId, refresh]);

  return count;
}
