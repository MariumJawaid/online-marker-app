import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTestStore } from '../stores/testStore';
import { Answer } from '../types';

/**
 * Fetches any previously saved answers from the `answers` table
 * for the given attemptId and pre-fills the Zustand store so
 * the student can resume where they left off.
 */
export function useResumeTest(attemptId: string | null) {
  const [isRestoring, setIsRestoring] = useState(false);
  const selectOption = useTestStore((s) => s.selectOption);

  useEffect(() => {
    if (!attemptId) return;

    let cancelled = false;

    const restore = async () => {
      setIsRestoring(true);
      try {
        const { data, error } = await supabase
          .from('answers')
          .select('question_id, selected_option')
          .eq('attempt_id', attemptId);

        if (error) {
          console.error('[useResumeTest] fetch error:', error.message);
          return;
        }

        if (!cancelled && data && data.length > 0) {
          // Bulk-apply saved answers into store
          const savedMap: Record<string, string> = {};
          for (const row of data as Pick<Answer, 'question_id' | 'selected_option'>[]) {
            savedMap[row.question_id] = row.selected_option;
          }

          // If we have access to init we already pass savedAnswers in init,
          // but this hook also supports a "late restore" scenario where the
          // store was already initialised without saved answers.
          for (const [qId, opt] of Object.entries(savedMap)) {
            selectOption(qId, opt);
          }
        }
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  return { isRestoring };
}
