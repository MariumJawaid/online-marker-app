import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchResults, fetchTestSettings } from '../services/SubmissionService';
import { supabase } from '../lib/supabase';
import { NavigationParamList, TestAttempt, Answer, Question } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = NativeStackScreenProps<NavigationParamList, 'Results'>;

interface QuestionResult {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string | null;
}

interface AnswerRow {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option: string;
  answered_at: string;
  is_correct: boolean | null;
  marks_awarded: number | null;
  questions: QuestionResult | null;
}

interface AnswerWithQuestion {
  id: string;
  attempt_id?: string;
  question_id: string;
  selected_option?: string;
  answered_at?: string;
  is_correct?: boolean | null;
  marks_awarded?: number | null;
  question?: QuestionResult;
}

export default function ResultsScreen({ route, navigation }: Props) {
  const { attemptId, testId } = route.params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading]       = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [attempt, setAttempt]       = useState<TestAttempt | null>(null);
  const [answers, setAnswers]       = useState<AnswerWithQuestion[]>([]);
  const [testTotalMarks, setTestTotalMarks] = useState<number | null>(null);
  const [allQuestions, setAllQuestions] = useState<AnswerWithQuestion[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        // 1. Fetch test for total_marks and template_id
        const { data: test } = await supabase
          .from('tests')
          .select('template_id, total_marks')
          .eq('id', testId)
          .single();

        let showImmediately = false;
        if (test?.template_id) {
          const { data: template } = await supabase
            .from('templates')
            .select('show_results_immediately')
            .eq('id', test.template_id)
            .single();
          showImmediately = template?.show_results_immediately ?? false;
        }
        setShowResults(showImmediately);
        
        if (test?.total_marks) {
          setTestTotalMarks(test.total_marks);
        }

        // 2. Fetch attempt
        const attemptData = await fetchResults(attemptId);
        setAttempt(attemptData);

        // 3. If showing results, fetch all questions and answers
        if (showImmediately) {
          // Fetch all test questions
          const { data: testQuestions } = await supabase
            .from('test_questions')
            .select('question_id')
            .eq('test_id', testId);

          if (testQuestions && testQuestions.length > 0) {
            const questionIds = testQuestions.map(tq => tq.question_id);

            // Fetch all question details
            const { data: allQs } = await supabase
              .from('questions')
              .select('id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation')
              .in('id', questionIds)
              .returns<QuestionResult[]>();

            // Fetch student's answers
            const { data: answerRows } = await supabase
              .from('answers')
              .select(`
                id,
                attempt_id,
                question_id,
                selected_option,
                answered_at,
                is_correct,
                marks_awarded
              `)
              .eq('attempt_id', attemptId)
              .returns<AnswerRow[]>();

            // Create a map of answers by question_id for quick lookup
            const answersMap = new Map(
              answerRows?.map(a => [a.question_id, a]) || []
            );

            // Merge all questions with student answers
            const mergedResults = (allQs || []).map(q => {
              const studentAnswer = answersMap.get(q.id);
              if (studentAnswer) {
                return {
                  id: studentAnswer.id,
                  attempt_id: studentAnswer.attempt_id,
                  question_id: studentAnswer.question_id,
                  selected_option: studentAnswer.selected_option,
                  answered_at: studentAnswer.answered_at,
                  is_correct: studentAnswer.is_correct,
                  marks_awarded: studentAnswer.marks_awarded,
                  question: q,
                };
              } else {
                // Unanswered question
                return {
                  id: q.id,
                  attempt_id: attemptId,
                  question_id: q.id,
                  selected_option: undefined,
                  answered_at: undefined,
                  is_correct: false,
                  marks_awarded: 0,
                  question: q,
                };
              }
            });

            setAllQuestions(mergedResults);
            setAnswers(mergedResults.filter(r => r.selected_option !== undefined));
          }
        }
      } catch (err) {
        console.error('[Results] load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [attemptId, testId]);

  // ── Helper: map selected_option letter to full text ──
  const getOptionText = (question: QuestionResult, letter: string): string => {
    const map: Record<string, string> = {
      A: question.option_a,
      B: question.option_b,
      C: question.option_c,
      D: question.option_d,
    };
    return map[letter?.toUpperCase()] ?? letter;
  };

  // ── Derived stats from answers (since DB may not store correct_answers count) ──
  const correctCount  = answers.filter((a) => a.is_correct === true).length;
  const totalMarks    = answers.reduce((sum, a) => sum + (Number(a.marks_awarded) || 0), 0);
  const questionsToDisplay = allQuestions.length > 0 ? allQuestions : answers;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  // ── Submission confirmed, results not yet available ──
  if (!showResults) {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.confirmCard}>
          <Text style={styles.checkmark}>✓</Text>
          <Text style={styles.confirmTitle}>Test Submitted</Text>
          <Text style={styles.confirmSub}>
            Your answers have been recorded. Results will be available once the teacher reviews them.
          </Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.replace('Dashboard')}
            activeOpacity={0.7}
          >
            <Text style={styles.backBtnText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Detailed results ──
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Score card */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Your Score</Text>
          <Text style={styles.scoreValue}>
            {attempt?.score != null ? Number(attempt.score).toFixed(1) : totalMarks.toFixed(1)}
            <Text style={styles.scoreDenom}> / {testTotalMarks ?? questionsToDisplay.length}</Text>
          </Text>
          <Text style={styles.correctText}>
            ✓ Correct: {correctCount}{'   '}
            ✗ Wrong: {answers.length - correctCount}{'   '}
            ⚠ Unanswered: {questionsToDisplay.length - answers.length}
          </Text>
        </View>

        {/* Per-question breakdown */}
        {questionsToDisplay.map((a, idx) => {
          const q          = a.question;
          const isAnswered = a.selected_option !== undefined;
          const isCorrect  = a.is_correct === true;
          const yourText   = q && isAnswered ? getOptionText(q, a.selected_option ?? '') : '—';
          const correctText = q ? getOptionText(q, q.correct_option) : '—';

          return (
            <View
              key={a.question_id || a.id}
              style={[
                styles.resultRow,
                !isAnswered ? styles.unansweredRow : (isCorrect ? styles.correctRow : styles.incorrectRow),
              ]}
            >
              {/* Question number + text */}
              <Text style={styles.resultQ}>
                Q{idx + 1}.{'  '}{q?.question_text ?? '—'}
              </Text>

              {/* Unanswered indicator */}
              {!isAnswered && (
                <Text style={[styles.resultMeta, { color: '#FFC107', fontWeight: '600' }]}>
                  ⚠ Not Answered
                </Text>
              )}

              {/* Student's answer (if answered) */}
              {isAnswered && (
                <Text style={styles.resultMeta}>
                  Your answer:{' '}
                  <Text style={[
                    styles.answerBold,
                    { color: isCorrect ? '#10B981' : '#EF4444' },
                  ]}>
                    {a.selected_option}. {yourText}
                  </Text>
                </Text>
              )}

              {/* Correct answer */}
              {q && (
                <Text style={styles.resultMeta}>
                  Correct answer:{' '}
                  <Text style={[styles.answerBold, { color: '#10B981' }]}>
                    {q.correct_option}. {correctText}
                  </Text>
                </Text>
              )}

              {/* Marks */}
              {isAnswered && (
                <Text style={styles.marksText}>
                  Marks: {a.marks_awarded != null ? Number(a.marks_awarded).toFixed(1) : '—'}
                </Text>
              )}

              {/* Explanation */}
              {q?.explanation ? (
                <Text style={styles.explanation}>💡 {q.explanation}</Text>
              ) : null}
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.backBtn, { alignSelf: 'center', marginTop: 24, marginBottom: 16 }]}
          onPress={() => navigation.replace('Dashboard')}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F1A',
    padding: 24,
  },
  scrollContent: { padding: 20, paddingBottom: 40 },

  // ── Confirmation card ──
  confirmCard: {
    backgroundColor: '#14142B',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D2D44',
    width: '100%',
  },
  checkmark:    { fontSize: 48, color: '#2ECC71', marginBottom: 12 },
  confirmTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 10 },
  confirmSub:   { fontSize: 14, color: '#8888AA', textAlign: 'center', lineHeight: 22, marginBottom: 24 },

  // ── Score card ──
  scoreCard: {
    backgroundColor: '#14142B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  scoreLabel:   { fontSize: 13, color: '#8888AA', fontWeight: '600', marginBottom: 6, letterSpacing: 1 },
  scoreValue:   { fontSize: 48, fontWeight: '700', color: '#6C63FF' },
  scoreDenom:   { fontSize: 24, color: '#8888AA', fontWeight: '400' },
  correctText:  { fontSize: 14, color: '#8888AA', marginTop: 8 },

  // ── Result rows ──
  resultRow: {
    backgroundColor: '#14142B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  correctRow:   { borderLeftWidth: 3, borderLeftColor: '#10B981' },
  incorrectRow: { borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  unansweredRow: { borderLeftWidth: 3, borderLeftColor: '#FFC107' },
  resultQ:      { fontSize: 15, color: '#fff', fontWeight: '600', marginBottom: 10, lineHeight: 22 },
  resultMeta:   { fontSize: 13, color: '#8888AA', marginBottom: 4 },
  answerBold:   { fontWeight: '700' },
  marksText:    { fontSize: 12, color: '#555577', marginTop: 6 },
  explanation: {
    fontSize: 13,
    color: '#FFC107',
    marginTop: 8,
    lineHeight: 20,
    borderTopWidth: 1,
    borderTopColor: '#2D2D44',
    paddingTop: 8,
  },

  // ── Back button ──
  backBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});