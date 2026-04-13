import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTestStore } from '../stores/testStore';

interface Props {
  onSubmit: () => void;
  isSaving: boolean;
  totalQuestions: number;
}

export default function TestNavigation({ onSubmit, isSaving, totalQuestions }: Props) {
  const insets = useSafeAreaInsets();

  const currentQuestionIndex = useTestStore((s) => s.currentQuestionIndex);
  const nextQuestion         = useTestStore((s) => s.nextQuestion);
  const prevQuestion         = useTestStore((s) => s.prevQuestion);
  const questions            = useTestStore((s) => s.questions);
  const testSettings         = useTestStore((s) => s.testSettings);
  const lockedQuestions      = useTestStore((s) => s.lockedQuestions);

  const isFirst = currentQuestionIndex === 0;
  const isLast  = currentQuestionIndex === totalQuestions - 1;

  const canGoNext = !isLast;

  // Check if previous question is locked (time expired + lock_section_navigation enabled)
  const canGoPrev = !isFirst && !(
    testSettings?.lockSectionNavigation && 
    questions[currentQuestionIndex - 1] && 
    lockedQuestions.has(questions[currentQuestionIndex - 1].id)
  );
  return (
    <View
      style={[
        styles.bar,
        // Push the bar above the home indicator / gesture bar
        { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      {/* Prev */}
      <TouchableOpacity
        style={[styles.navBtn, !canGoPrev && styles.navBtnDisabled]}
        onPress={prevQuestion}
        disabled={!canGoPrev}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={[styles.navBtnText, !canGoPrev && styles.navBtnTextDisabled]}>
          ‹ Prev {testSettings?.lockSectionNavigation && questions[currentQuestionIndex - 1] && lockedQuestions.has(questions[currentQuestionIndex - 1].id) && '🔒'}
        </Text>
      </TouchableOpacity>

      {/* Saving indicator / Submit */}
      {isSaving ? (
        <View style={styles.savingPill}>
          <Text style={styles.savingPillText}>Saving…</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={onSubmit}
          disabled={isSaving}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.submitBtnText}>Submit</Text>
        </TouchableOpacity>
      )}

      {/* Next */}
      <TouchableOpacity
        style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
        onPress={nextQuestion}
        disabled={!canGoNext}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={[styles.navBtnText, !canGoNext && styles.navBtnTextDisabled]}>
          Next ›
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#1A2340',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  navBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#334155',
    minWidth: 90,
    alignItems: 'center',
  },
  navBtnDisabled: { backgroundColor: '#334155', opacity: 0.5 },
  navBtnText: { color: '#E0E7FF', fontSize: 16, fontWeight: '600' },
  navBtnTextDisabled: { color: '#64748B' },
  submitBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: '#10B981',
    minWidth: 120,
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  savingPill: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#FBBF24',
    minWidth: 120,
    alignItems: 'center',
  },
  savingPillText: { color: '#78350F', fontSize: 14, fontWeight: '600' },
});