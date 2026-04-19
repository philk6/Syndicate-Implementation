'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@lib/supabase/client';

/**
 * Returns the user's unread prep-notification count.
 *
 * Uses a Supabase realtime subscription (instant) + a 5-minute polling
 * fallback. Queries the DB directly (single-count HEAD request) instead
 * of calling a server action, which avoids spinning up a service-role
 * client every poll.
 *
 * Debounces rapid-fire events (e.g. admin sending 5 notifications at
 * once) with a 2-second trailing window.
 */
export function usePrepUnreadCount(userId: string | null | undefined): number {
  const [count, setCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const { count: n } = await supabase
        .from('prep_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      setCount(n ?? 0);
    } catch {
      // Badge isn't critical — swallow
    }
  }, [userId]);

  // Debounced version for realtime events
  const debouncedRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 2000);
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
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
        debouncedRefresh,
      )
      .subscribe();

    // Poll every 5 minutes as fallback (was 60s — too aggressive)
    const interval = window.setInterval(refresh, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [userId, refresh, debouncedRefresh]);

  return count;
}
