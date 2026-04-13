import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTestStore } from '../stores/testStore';

interface UseSupabaseRealtimeParams {
  testId: string | null;
  onForceSubmit: () => void;
}

/**
 * Subscribes to realtime changes on the `tests` table for the given testId.
 *
 * Handles two teacher-triggered events:
 *  1. Force Submit  — if `end_time` is set to a past timestamp, triggers submission.
 *  2. Time Extension — if `end_time` is pushed forward, extends the local timer by the delta.
 */
export function useSupabaseRealtime({ testId, onForceSubmit }: UseSupabaseRealtimeParams) {
  const extendTime      = useTestStore((s) => s.extendTime);
  const prevEndTimeRef  = useRef<string | null>(null);

  useEffect(() => {
    if (!testId) return;

    const channel = supabase
      .channel(`test-updates-${testId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'tests',
          filter: `id=eq.${testId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            end_time: string | null;
            is_published: boolean;
            total_marks: number | null;
          };

          // ── Force Submit ──────────────────────────────────────────────────
          // Teacher force-ends the test by setting end_time to now or the past
          if (updated.end_time) {
            const endTime = new Date(updated.end_time);
            const now     = new Date();

            if (endTime <= now) {
              onForceSubmit();
              return;
            }

            // ── Time Extension ──────────────────────────────────────────────
            // Teacher pushed end_time further into the future
            if (prevEndTimeRef.current) {
              const prevEnd = new Date(prevEndTimeRef.current);
              if (endTime > prevEnd) {
                // Delta in seconds to add to the running timer
                const deltaSeconds = Math.floor(
                  (endTime.getTime() - prevEnd.getTime()) / 1000
                );
                extendTime(deltaSeconds);
              }
            }
          }

          // ── is_published toggled off = force submit ──────────────────────
          if (updated.is_published === false) {
            onForceSubmit();
            return;
          }

          // Track end_time for next update comparison
          if (updated.end_time) {
            prevEndTimeRef.current = updated.end_time;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [testId, onForceSubmit, extendTime]);
}