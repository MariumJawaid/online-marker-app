import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

const OFFLINE_QUEUE_KEY = 'offline_answer_queue';
const VALID_OPTION_KEYS = new Set(['A', 'B', 'C', 'D']);

// ── Types ──

interface SaveAnswerParams {
  attemptId: string;
  questionId: string;
  selectedOption: string;
}

interface QueuedAnswer extends SaveAnswerParams {
  answered_at: string;
}

function normalizeSelectedOption(selectedOption: string): string {
  return selectedOption.trim().toUpperCase();
}

// ── Core upsert ──

async function upsertToSupabase(params: SaveAnswerParams): Promise<boolean> {
  try {
    console.log('[saveAnswer] upsertToSupabase called with:', params);
    const normalizedOption = normalizeSelectedOption(params.selectedOption);
    
    // Validate selected_option is not empty
    if (!params.selectedOption || normalizedOption === '') {
      console.error('[saveAnswer] Selected option is empty/null:', { selectedOption: params.selectedOption, type: typeof params.selectedOption });
      return false;
    }

    if (!VALID_OPTION_KEYS.has(normalizedOption)) {
      console.error('[saveAnswer] Invalid selected_option. Expected A/B/C/D:', {
        selectedOption: params.selectedOption,
        normalizedOption,
      });
      return false;
    }

    // Delete any existing answer for this question in this attempt
    await supabase
      .from('answers')
      .delete()
      .eq('attempt_id', params.attemptId)
      .eq('question_id', params.questionId);

    // Insert the new answer
    const { error } = await supabase
      .from('answers')
      .insert({
        attempt_id: params.attemptId,
        question_id: params.questionId,
        selected_option: normalizedOption,
        answered_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[saveAnswer] insert failed:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[saveAnswer] exception:', err.message);
    return false;
  }
}

// ── Offline queue helpers ──

async function enqueue(item: QueuedAnswer): Promise<void> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  const queue: QueuedAnswer[] = raw ? JSON.parse(raw) : [];

  // Replace existing entry for the same question if student changed their mind
  const idx = queue.findIndex(
    (q) => q.attemptId === item.attemptId && q.questionId === item.questionId
  );
  if (idx >= 0) queue[idx] = item;
  else queue.push(item);

  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async function drainQueue(): Promise<void> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return;
  const queue: QueuedAnswer[] = JSON.parse(raw);
  if (queue.length === 0) return;

  const remaining: QueuedAnswer[] = [];

  for (const item of queue) {
    const normalizedOption = normalizeSelectedOption(item.selectedOption);
    const ok = await upsertToSupabase({ ...item, selectedOption: normalizedOption });
    if (!ok && VALID_OPTION_KEYS.has(normalizedOption)) {
      remaining.push({ ...item, selectedOption: normalizedOption });
    }
  }

  if (remaining.length > 0) {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } else {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  }
}

// ── Public API ──

/**
 * Saves (upserts) a student's answer to the answers table.
 * Falls back to an offline AsyncStorage queue when the device is offline.
 */
export async function saveAnswer(params: SaveAnswerParams): Promise<void> {
  const normalizedOption = normalizeSelectedOption(params.selectedOption);
  if (!VALID_OPTION_KEYS.has(normalizedOption)) {
    console.error('[saveAnswer] Refusing to queue invalid selected_option:', params.selectedOption);
    return;
  }

  const normalizedParams = { ...params, selectedOption: normalizedOption };
  const networkState = await Network.getNetworkStateAsync();
  const isOnline = networkState.isConnected && networkState.isInternetReachable;

  if (isOnline) {
    // Try to drain any previously queued answers first
    await drainQueue();

    const ok = await upsertToSupabase(normalizedParams);
    if (!ok) {
      // Network hiccup – queue it
      await enqueue({ ...normalizedParams, answered_at: new Date().toISOString() });
    }
  } else {
    // Offline – queue locally
    await enqueue({ ...normalizedParams, answered_at: new Date().toISOString() });
  }
}

/**
 * Flush all queued offline answers to Supabase.
 * Call this when the app regains connectivity.
 */
export async function flushOfflineQueue(): Promise<void> {
  await drainQueue();
}
