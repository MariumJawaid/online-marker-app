import { supabase } from '../lib/supabase';
import { normalizeTest } from '../lib/typeConversion';
import { TestAttempt } from '../types';

/**
 * Submits the exam:
 *  1. Updates test_assignments → status = 'submitted', submitted_at = now()
 *  2. Updates attempts → submitted_at = now()
 */
export async function submitExam(params: {
  attemptId: string;
  testId: string;
  studentId: string;
}): Promise<TestAttempt | null> {
  const { attemptId, testId, studentId } = params;
  const now = new Date().toISOString();

  // Validate studentId is not empty
  if (!studentId || studentId.trim() === '') {
    console.error('[submitExam] studentId is empty or invalid');
    return null;
  }

  // 1. Mark the assignment as submitted
  const { error: assignErr } = await supabase
    .from('test_assignments')
    .update({ status: 'submitted', submitted_at: now })
    .eq('test_id', testId)
    .eq('student_id', studentId);

  if (assignErr) {
    console.error('[submitExam] test_assignments update failed:', assignErr.message);
  }

  // 2. Mark the attempt as submitted
  console.log('[submitExam] Updating attempt with submitted_at:', { attemptId, submitted_at: now });
  const { error: attemptErr, data: updateRes } = await supabase
    .from('attempts')
    .update({ submitted_at: now })
    .eq('id', attemptId)
    .select()
    .single();

  if (attemptErr) {
    console.error('[submitExam] attempts update failed:', attemptErr.message);
    return null;
  }

  console.log('[submitExam] ✔️ Attempt submitted successfully:', updateRes);
  return updateRes as TestAttempt;
}

/**
 * Fetches the evaluated result for a given attempt.
 */
export async function fetchResults(attemptId: string): Promise<TestAttempt | null> {
  const { data, error } = await supabase
    .from('attempts')
    .select('*')
    .eq('id', attemptId)
    .single();

  if (error) {
    console.error('[fetchResults] error:', error.message);
    return null;
  }

  // Ensure data types are correct (Supabase may return strings for booleans)
  return {
    ...data,
    // Keep all fields as-is; TestAttempt doesn't have boolean issues in this structure
  } as TestAttempt;
}

/**
 * Fetches test settings needed for conditional result visibility.
 */
export async function fetchTestSettings(testId: string) {
  const { data, error } = await supabase
    .from('tests')
    .select('*')
    .eq('id', testId)
    .single();

  if (error) {
    console.error('[fetchTestSettings] error:', error.message);
    return null;
  }

  return normalizeTest(data);
}
