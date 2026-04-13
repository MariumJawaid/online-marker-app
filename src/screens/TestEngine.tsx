import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { useTestStore } from '../stores/testStore';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { useResumeTest } from '../hooks/useResumeTest';
import { saveAnswer, flushOfflineQueue } from '../services/saveAnswerService';
import { submitExam } from '../services/SubmissionService';
import TestNavigation from '../components/TestNavigation';
import { useAuthStore } from '../stores/authStore';
import { useAppStateProctoring } from '../hooks/useAppStateProctoring';
import { shuffleQuestions, shuffleOptions } from '../lib/shuffleQuestions';
import { Question, NavigationParamList } from '../types';

type Props = NativeStackScreenProps<NavigationParamList, 'TestEngine'>;

const OPTION_KEYS = ['option_a', 'option_b', 'option_c', 'option_d'] as const;
type OptionLetter = 'A' | 'B' | 'C' | 'D';

function getOptionLetter(question: Question, optionText: string): OptionLetter | null {
  const norm = (s: string) => s?.trim().toLowerCase();
  const t = norm(optionText);
  if (t === norm(question.option_a)) return 'A';
  if (t === norm(question.option_b)) return 'B';
  if (t === norm(question.option_c)) return 'C';
  if (t === norm(question.option_d)) return 'D';
  return null;
}

export default function TestEngine({ route, navigation }: Props) {
  const { testId } = route.params;
  const profile    = useAuthStore((s) => s.profile);

  const [bootstrapping, setBootstrapping]   = useState(true);
  const [submitting, setSubmitting]         = useState(false);
  const [preventTabSwitch, setPreventTabSwitch] = useState(false); // ← state for proctoring

  const attemptId            = useTestStore((s) => s.attemptId);
  const questions            = useTestStore((s) => s.questions);
  const currentQuestionIndex = useTestStore((s) => s.currentQuestionIndex);
  const selectedOptions      = useTestStore((s) => s.selectedOptions);
  const flaggedForReview     = useTestStore((s) => s.flaggedForReview);
  const remainingTime        = useTestStore((s) => s.remainingTime);
  const isSaving             = useTestStore((s) => s.isSaving);
  const init                 = useTestStore((s) => s.init);
  const selectOption         = useTestStore((s) => s.selectOption);
  const toggleFlag           = useTestStore((s) => s.toggleFlag);
  const setRemainingTime     = useTestStore((s) => s.setRemainingTime);
  const setIsSaving          = useTestStore((s) => s.setIsSaving);
  const reset                = useTestStore((s) => s.reset);
  const setQuestionTimeRemaining = useTestStore((s) => s.setQuestionTimeRemaining);
  const lockQuestion         = useTestStore((s) => s.lockQuestion);
  const questionTimeRemaining = useTestStore((s) => s.questionTimeRemaining);
  const lockedQuestions      = useTestStore((s) => s.lockedQuestions);
  const timePerQuestion      = useTestStore((s) => s.timePerQuestion);

  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  useResumeTest(attemptId);

  // ── Realtime force submit (define early so hook can access it) ──────────────
  const handleForceSubmit = useCallback(() => {
    console.log('[TestEngine:handleForceSubmit] CALLED - Teacher ended test or proctoring violation');
    Alert.alert('Test Ended', 'The teacher has ended this test.');
    console.log('[TestEngine:handleForceSubmit] About to call handleSubmit(true)...');
    handleSubmit(true);
    console.log('[TestEngine:handleForceSubmit] handleSubmit(true) returned ✔️');
  }, [attemptId]);

  // ── Proctoring hook — must be at component level, never inside useEffect ──
  useAppStateProctoring({
    attemptId,
    preventTabSwitch,
    onForceSubmit: handleForceSubmit,
  });

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const studentId = profile?.userId;
        console.log('[TestEngine] Bootstrap StudentId from profile:', { studentId, profileUserId: profile?.userId, profileStudentId: profile?.studentId });
        
        if (!studentId) {
          console.error('[TestEngine] No logged-in student');
          navigation.replace('Login');
          return;
        }

        // 1. Fetch test
        const { data: test, error: testErr } = await supabase
          .from('tests')
          .select('*')
          .eq('id', testId)
          .single();

        if (testErr || !test || cancelled) {
          console.error('[TestEngine] test fetch failed:', testErr?.message);
          return;
        }

        // 2. Fetch template — include all proctoring + shuffle flags + attempt limits + time_per_question
        const { data: template } = await supabase
          .from('templates')
          .select(`
            duration_minutes,
            lock_section_navigation,
            show_results_immediately,
            prevent_tab_switch,
            shuffle_questions,
            shuffle_options,
            max_attempts,
            time_per_question
          `)
          .eq('id', test.template_id)
          .single();

        const durationSeconds        = (template?.duration_minutes    ?? 60)    * 60;
        const shouldPreventTabSwitch = template?.prevent_tab_switch   ?? false;
        const shouldShuffleQuestions = template?.shuffle_questions     ?? false;
        const shouldShuffleOptions   = template?.shuffle_options       ?? false;
        const maxAttempts            = template?.max_attempts          ?? 1;
        const lockSectionNav         = template?.lock_section_navigation ?? false;
        const timePerQuestionSeconds = (template?.time_per_question   ?? 0) * 60;  // Convert minutes to seconds

        // Set proctoring flag so the hook above activates
        setPreventTabSwitch(shouldPreventTabSwitch);

        // 3. Fetch questions via join table
        const { data: testQuestions, error: tqErr } = await supabase
          .from('test_questions')
          .select('question_id, marks')
          .eq('test_id', testId);

        if (tqErr || !testQuestions?.length || cancelled) {
          console.error('[TestEngine] test_questions fetch failed:', tqErr?.message);
          return;
        }

        const questionIds = testQuestions.map((tq) => tq.question_id);

        const { data: qs, error: qErr } = await supabase
          .from('questions')
          .select('*')
          .in('id', questionIds);

        if (qErr || !qs || cancelled) {
          console.error('[TestEngine] questions fetch failed:', qErr?.message);
          return;
        }

        // 4. Check max attempts before allowing re-entry
        const { data: allAttempts, error: attemptsErr } = await supabase
          .from('attempts')
          .select('id, submitted_at')
          .eq('test_id', testId)
          .eq('student_id', studentId);

        const submittedAttempts = allAttempts?.filter(a => a.submitted_at !== null).length ?? 0;
        console.log(`[TestEngine] Student has ${submittedAttempts} submitted attempts out of max ${maxAttempts}`);

        if (submittedAttempts >= maxAttempts) {
          Alert.alert(
            'Max Attempts Exceeded',
            `You have reached the maximum number of attempts (${maxAttempts}). You cannot take this test again.`
          );
          navigation.goBack();
          return;
        }

        // 5. Find or create attempt
        let attemptRow: any;

        const { data: existingAttempt } = await supabase
          .from('attempts')
          .select('*')
          .eq('test_id', testId)
          .eq('student_id', studentId)
          .maybeSingle();

        if (existingAttempt) {
          console.log('[TestEngine] Resuming attempt:', existingAttempt.id);
          attemptRow = existingAttempt;
        } else {
          const { data: newAttempt, error: insertErr } = await supabase
            .from('attempts')
            .insert({
              test_id:    testId,
              student_id: studentId,
              started_at: new Date().toISOString(),
              violations: 0,
            })
            .select()
            .single();

          if (insertErr || !newAttempt) {
            console.error('[TestEngine] create attempt failed:', insertErr?.message);
            return;
          }
          console.log('[TestEngine] Created new attempt:', { id: newAttempt.id, test_id: testId, student_id: studentId });
          attemptRow = newAttempt;
        }

        // 6. Load saved answers for resume
        const { data: savedRows } = await supabase
          .from('answers')
          .select('question_id, selected_option')
          .eq('attempt_id', attemptRow.id);

        const savedAnswers: Record<string, string> = {};
        if (savedRows) {
          for (const r of savedRows) savedAnswers[r.question_id] = r.selected_option;
        }

        // 7. Calculate remaining time
        const elapsedSecs = existingAttempt
          ? Math.floor((Date.now() - new Date(existingAttempt.started_at).getTime()) / 1000)
          : 0;
        const remaining = Math.max(durationSeconds - elapsedSecs, 0);

        // 8. Block re-entry if already submitted
        if (existingAttempt?.submitted_at) {
          Alert.alert('Already Submitted', 'This test has already been submitted.');
          navigation.replace('Results', { attemptId: existingAttempt.id, testId });
          return;
        }

        // 9. Handle expired unsubmitted attempt — reset it
        if (remaining === 0 && existingAttempt && !existingAttempt.submitted_at) {
          console.warn('[TestEngine] Attempt expired — creating fresh attempt');
          await supabase.from('answers').delete().eq('attempt_id', existingAttempt.id);
          await supabase.from('attempts').delete().eq('id', existingAttempt.id);

          const { data: freshAttempt, error: freshErr } = await supabase
            .from('attempts')
            .insert({
              test_id:    testId,
              student_id: studentId,
              started_at: new Date().toISOString(),
              violations: 0,
            })
            .select()
            .single();

          if (freshErr || !freshAttempt) {
            console.error('[TestEngine] Fresh attempt failed:', freshErr?.message);
            return;
          }
          attemptRow = freshAttempt;
        }

        // 10. Apply shuffles using attemptId as seed for determinism
        let finalQuestions = qs as Question[];

        if (shouldShuffleQuestions) {
          finalQuestions = shuffleQuestions(finalQuestions, attemptRow.id);
          console.log('[TestEngine] Questions shuffled for attempt:', attemptRow.id);
        }

        if (shouldShuffleOptions) {
          finalQuestions = finalQuestions.map((q) => shuffleOptions(q, attemptRow.id));
          console.log('[TestEngine] Options shuffled for attempt:', attemptRow.id);
        }

        // 11. Init store
        if (!cancelled) {
          init({
            testId,
            attemptId:     attemptRow.id,
            questions:     finalQuestions,
            totalDuration: remaining > 0 ? remaining : durationSeconds,
            settings: {
              lockSectionNavigation:  lockSectionNav,
              showResultsImmediately: template?.show_results_immediately ?? false,
              durationMinutes:        template?.duration_minutes         ?? 60,
            },
            timePerQuestion: timePerQuestionSeconds > 0 ? timePerQuestionSeconds : null,
            savedAnswers,
          });
          setBootstrapping(false);
        }
      } catch (err) {
        console.error('[TestEngine] bootstrap error:', err);
      }
    };

    bootstrap();
    return () => { cancelled = true; };
  }, [testId, profile]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (bootstrapping) return;

    timerRef.current = setInterval(() => {
      // Guard: Don't fire if already submitted
      if (submittedRef.current) {
        console.log('[Timer] ⏹️ Test already submitted, clearing timer');
        clearInterval(timerRef.current!);
        return;
      }

      const t = useTestStore.getState().remainingTime;
      if (t <= 1) {
        console.log('[Timer] ⏰ OVERALL TEST TIME EXPIRED! Auto-submitting...', { remainingTime: t });
        clearInterval(timerRef.current!);
        handleSubmit(true);
        return;
      }
      setRemainingTime(t - 1);
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [bootstrapping]);

  // ── Question-level Timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (bootstrapping || !timePerQuestion || timePerQuestion <= 0) return;

    const questionTimerRef = setInterval(() => {
      const currentQ = questions[currentQuestionIndex];
      if (!currentQ) return;

      const remaining = questionTimeRemaining[currentQ.id] ?? timePerQuestion;
      console.log(`[QuestionTimer] Q${currentQuestionIndex + 1} time: ${remaining}s`, { questionId: currentQ.id });
      
      if (remaining <= 1) {
        console.log('[QuestionTimer] ⏰ TIME EXPIRED', {
          questionIndex: currentQuestionIndex,
          questionId: currentQ.id,
          lockEnabled: useTestStore.getState().testSettings?.lockSectionNavigation,
        });
        clearInterval(questionTimerRef);
        
        // Lock question if lock_section_navigation is enabled
        if (useTestStore.getState().testSettings?.lockSectionNavigation) {
          lockQuestion(currentQ.id);
          console.log('[QuestionTimer] 🔒 LOCKED:', currentQ.id);
        }
        
        // Auto-advance to next question
        if (currentQuestionIndex < questions.length - 1) {
          console.log('[QuestionTimer] ➡️ AUTO-ADVANCE to Q' + (currentQuestionIndex + 2));
          useTestStore.getState().nextQuestion();
        } else {
          console.log('[QuestionTimer] 📤 LAST QUESTION - TRIGGERING AUTO-SUBMIT');
          handleSubmit(true);
        }
      } else {
        setQuestionTimeRemaining(currentQ.id, remaining - 1);
      }
    }, 1000);

    return () => { if (questionTimerRef) clearInterval(questionTimerRef); };
  }, [bootstrapping, currentQuestionIndex, timePerQuestion, questionTimeRemaining]);

  // ── Realtime force submit hook ───────────────────────────────────────────
  useSupabaseRealtime({ testId, onForceSubmit: handleForceSubmit });

  // ── Select option ─────────────────────────────────────────────────────────
  const handleSelectOption = async (questionId: string, optionText: string) => {
    const question = questions?.find((q) => q.id === questionId);
    if (!question) return;

    const optionLetter = getOptionLetter(question, optionText);
    if (!optionLetter) {
      console.warn('[TestEngine] Could not map option:', {
        received: JSON.stringify(optionText),
        option_a: JSON.stringify(question.option_a),
        option_b: JSON.stringify(question.option_b),
        option_c: JSON.stringify(question.option_c),
        option_d: JSON.stringify(question.option_d),
      });
      return;
    }

    selectOption(questionId, optionLetter);
    if (!attemptId) return;

    setIsSaving(true);
    await saveAnswer({ attemptId, questionId, selectedOption: optionLetter });
    setIsSaving(false);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (auto = false) => {
    console.log('[TestEngine:handleSubmit] 📋 CALLED', { 
      auto, 
      alreadySubmitted: submittedRef.current, 
      attemptId,
      currentQuestion: currentQuestionIndex + 1,
      totalQuestions: questions.length,
    });
    
    if (submittedRef.current || !attemptId) {
      console.warn('[TestEngine:handleSubmit] ❌ BLOCKED:', { already_submitted: submittedRef.current, no_attemptId: !attemptId });
      return;
    }

    if (!auto) {
      console.log('[TestEngine:handleSubmit] 🔍 MANUAL MODE - validating answers...');
      const unanswered = questions.filter((q) => !selectedOptions[q.id]);

      if (unanswered.length > 0) {
        console.warn('[TestEngine:handleSubmit] ⚠️ UNANSWERED QUESTIONS:', unanswered.length);
        Alert.alert(
          'Unanswered Questions',
          `You have ${unanswered.length} unanswered question${unanswered.length > 1 ? 's' : ''}. Do you still want to submit?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Submit Anyway', style: 'destructive', onPress: () => proceedWithSubmit() },
          ]
        );
        return;
      }

      console.log('[TestEngine:handleSubmit] 👤 Showing manual confirmation dialog...');
      Alert.alert(
        'Submit Test',
        'Are you sure? You cannot change your answers after submission.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Submit', style: 'destructive', onPress: () => proceedWithSubmit() },
        ]
      );
      return;
    }

    console.log('[TestEngine:handleSubmit] ⚡ AUTO MODE - skipping validation, proceeding to submit...');
    await proceedWithSubmit();
  };

  const proceedWithSubmit = async () => {
    console.log('[TestEngine:proceedWithSubmit] 🚀 START', { submittedRef: submittedRef.current, attemptId });
    
    if (submittedRef.current || !attemptId) {
      console.warn('[TestEngine:proceedWithSubmit] ❌ BLOCKED - Guard check failed:', { submittedRef: submittedRef.current, attemptId });
      return;
    }
    
    submittedRef.current = true;
    console.log('[TestEngine:proceedWithSubmit] ✅ Set submittedRef=true (preventing double-submit)');
    
    if (timerRef.current) clearInterval(timerRef.current);

    setSubmitting(true);
    console.log('[TestEngine:proceedWithSubmit] 📤 Flushing offline queue...');
    await flushOfflineQueue();

    console.log('[TestEngine:proceedWithSubmit] 📡 Calling submitExam...', { attemptId, testId });
    await submitExam({
      attemptId,
      testId,
      studentId: profile?.userId ?? '',
    });

    console.log('[TestEngine:proceedWithSubmit] ✔️ submitExam completed');
    setSubmitting(false);
    reset();
    console.log('[TestEngine:proceedWithSubmit] 🎯 Navigating to Results...');
    navigation.replace('Results', { attemptId, testId });
  };

  // ── Loading states ────────────────────────────────────────────────────────
  if (bootstrapping) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Preparing your exam...</Text>
      </View>
    );
  }

  if (submitting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#27AE60" />
        <Text style={styles.loadingText}>Submitting…</Text>
      </View>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  if (!currentQuestion) return null;

  const formatTime = (s: number) => {
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const selectedOpt = selectedOptions[currentQuestion.id];
  const isFlagged   = flaggedForReview.has(currentQuestion.id);

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* ── Header ── */}
        <View style={styles.topBar}>
          <Text style={styles.timerText}>{formatTime(remainingTime)}</Text>
          {timePerQuestion && timePerQuestion > 0 && (
            <Text style={styles.questionTimerText}>
              Q: {formatTime(questionTimeRemaining[currentQuestion.id] ?? timePerQuestion)}
            </Text>
          )}
          <Text style={styles.questionCounter}>
            {currentQuestionIndex + 1} / {questions.length}
          </Text>
          {isSaving && <Text style={styles.savingBadge}>Saving…</Text>}
        </View>

        {/* ── Question + Options ── */}
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.questionCard}>
            <Text style={styles.questionText}>{currentQuestion.question_text}</Text>
          </View>

          {OPTION_KEYS.map((key) => {
            const text       = currentQuestion[key];
            const isSelected = selectedOpt === getOptionLetter(currentQuestion, text);
            return (
              <TouchableOpacity
                key={key}
                style={[styles.optionBtn, isSelected && styles.optionSelected]}
                onPress={() => handleSelectOption(currentQuestion.id, text)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                  {key.replace('option_', '').toUpperCase()}
                </Text>
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {text}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.flagBtn}
            onPress={() => toggleFlag(currentQuestion.id)}
          >
            <Text style={styles.flagText}>
              {isFlagged ? '⚑ Flagged for Review' : '⚐ Flag for Review'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Navigation ── */}
        <TestNavigation
          onSubmit={() => handleSubmit(false)}
          isSaving={isSaving}
          totalQuestions={questions.length}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: '#0F172A' },
  container:     { flex: 1, backgroundColor: '#0F172A' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: { color: '#A0AEC0', marginTop: 16, fontSize: 16 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1A2340',
    borderBottomWidth: 2,
    borderBottomColor: '#334155',
    minHeight: 60,
  },
  timerText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#EF4444',
    fontVariant: ['tabular-nums'],
    minWidth: 70,
  },
  questionTimerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FBBF24',
    marginHorizontal: 12,
    minWidth: 80,
  },
  questionCounter:  { fontSize: 16, color: '#E0E7FF', fontWeight: '700', minWidth: 50 },
  savingBadge: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  body:         { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  questionCard: {
    backgroundColor: '#1A2340',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  questionText:        { fontSize: 17, color: '#FFFFFF', lineHeight: 26 },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 1,
  },
  optionSelected:      { borderColor: '#3B82F6', backgroundColor: '#1E3A8A' },
  optionLabel: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    color: '#A0AEC0',
    textAlign: 'center',
    lineHeight: 32,
    fontWeight: 'bold',
    fontSize: 14,
    marginRight: 16,
    overflow: 'hidden',
  },
  optionLabelSelected: { backgroundColor: '#3B82F6', color: '#FFFFFF' },
  optionText:          { fontSize: 16, color: '#D1D5DB', flex: 1, lineHeight: 22 },
  optionTextSelected:  { color: '#E0E7FF', fontWeight: '500' },
  flagBtn:  { alignSelf: 'center', marginTop: 16, paddingVertical: 10 },
  flagText: { fontSize: 14, color: '#FBBF24', fontWeight: '600' },
});