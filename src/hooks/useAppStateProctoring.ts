import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

interface UseAppStateProctoringParams {
  attemptId: string | null;
  preventTabSwitch: boolean;
  onForceSubmit: () => void;
}

const MAX_VIOLATIONS = 3; // submit after 3 violations

export function useAppStateProctoring({
  attemptId,
  preventTabSwitch,
  onForceSubmit,
}: UseAppStateProctoringParams) {
  const violationCountRef = useRef(0);
  const appStateRef       = useRef<AppStateStatus>(AppState.currentState);
  const submittedRef      = useRef(false); // Prevent duplicate submissions

  useEffect(() => {
    if (!preventTabSwitch || !attemptId) {
      console.log('[Proctoring] Hook disabled:', { preventTabSwitch, attemptId });
      return;
    }

    console.log('[Proctoring] Hook activated - monitoring tab switches');

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      console.log('[Proctoring] App state changed:', { prevState, nextState });

      // Student left the app (went to background or another app)
      if (
        (prevState === 'active') &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        // Block if already submitted
        if (submittedRef.current) {
          console.log('[Proctoring] Already submitted - ignoring further tab switches');
          return;
        }

        violationCountRef.current += 1;
        const count = violationCountRef.current;

        console.warn('[Proctoring] Tab switch detected. Violations:', count, '/', MAX_VIOLATIONS);

        // ── Increment violations in DB ──────────────────────────────────────
        const { error: rpcError } = await supabase.rpc('increment_violations', { attempt_id: attemptId });
        if (rpcError) {
          console.error('[Proctoring] Failed to increment violations:', rpcError.message);
        }

        if (count >= MAX_VIOLATIONS) {
          submittedRef.current = true; // Mark as submitted to prevent duplicate submissions
          
          console.error('[Proctoring] Max violations reached (', count, ')! Force-submitting test immediately...');
          
          // Call onForceSubmit immediately
          onForceSubmit();
          
          // Show alert after submission is triggered
          Alert.alert(
            'Test Terminated',
            'You have switched out of the app too many times (violation ' + count + '). Your test has been auto-submitted.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Warning',
            `You left the test app. This is violation ${count} of ${MAX_VIOLATIONS}. Your test will be auto-submitted if you leave again.`
          );
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    console.log('[Proctoring] AppState listener attached for attemptId:', attemptId);
    
    return () => {
      subscription.remove();
      console.log('[Proctoring] AppState listener removed');
    };
  }, [attemptId, preventTabSwitch, onForceSubmit]);

  return { violationCount: violationCountRef.current };
}