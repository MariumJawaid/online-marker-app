import { create } from 'zustand';
import { TestStoreState, TestStoreActions } from '../types';

const initialState: TestStoreState = {
  testId: null,
  attemptId: null,
  questions: [],
  currentQuestionIndex: 0,
  selectedOptions: {},
  flaggedForReview: new Set<string>(),
  remainingTime: 0,
  timePerQuestion: null,
  questionTimeRemaining: {},
  lockedQuestions: new Set<string>(),
  isSaving: false,
  testSettings: null,
};

export const useTestStore = create<TestStoreState & TestStoreActions>((set, get) => ({
  ...initialState,

  init: ({ testId, attemptId, questions, totalDuration, settings, timePerQuestion, savedAnswers }) => {
    // Initialize question times
    const questionTimeRemaining: Record<string, number> = {};
    if (timePerQuestion && timePerQuestion > 0) {
      questions.forEach((q) => {
        questionTimeRemaining[q.id] = timePerQuestion;
      });
    }

    set({
      testId,
      attemptId,
      questions,
      remainingTime: totalDuration,
      timePerQuestion: timePerQuestion ?? null,
      questionTimeRemaining,
      lockedQuestions: new Set<string>(),
      testSettings: settings,
      currentQuestionIndex: 0,
      selectedOptions: savedAnswers ?? {},
      flaggedForReview: new Set<string>(),
      isSaving: false,
    });
  },

  selectOption: (questionId, optionText) => {
    set((state) => ({
      selectedOptions: { ...state.selectedOptions, [questionId]: optionText },
    }));
  },

  toggleFlag: (questionId) => {
    set((state) => {
      const next = new Set(state.flaggedForReview);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return { flaggedForReview: next };
    });
  },

  nextQuestion: () => {
    set((state) => {
      if (state.currentQuestionIndex >= state.questions.length - 1) return {};
      // lockSectionNavigation is a no-op until section_id exists in DB
      return { currentQuestionIndex: state.currentQuestionIndex + 1 };
    });
  },

  prevQuestion: () => {
    set((state) => {
      if (state.currentQuestionIndex <= 0) return {};
      const prevIndex = state.currentQuestionIndex - 1;
      const prevQuestion = state.questions[prevIndex];
      
      // Check if lock_section_navigation is enabled and previous question is locked
      if (state.testSettings?.lockSectionNavigation && state.lockedQuestions.has(prevQuestion.id)) {
        console.warn('[TestStore:prevQuestion] 🔒 BLOCKED - Previous question locked', {
          currentIndex: state.currentQuestionIndex,
          prevIndex,
          questionId: prevQuestion.id,
          lockedQuestions: Array.from(state.lockedQuestions),
        });
        return {};
      }
      
      console.log('[TestStore:prevQuestion] ✔️ Moving to previous question', { from: state.currentQuestionIndex, to: prevIndex });
      return { currentQuestionIndex: prevIndex };
    });
  },

  jumpToQuestion: (index) => {
    set((state) => {
      if (index < 0 || index >= state.questions.length) return {};
      return { currentQuestionIndex: index };
    });
  },

  setRemainingTime: (t) => set({ remainingTime: t }),
  extendTime: (delta) => set((state) => ({ remainingTime: state.remainingTime + delta })),
  setQuestionTimeRemaining: (questionId, t) => {
    set((state) => ({
      questionTimeRemaining: { ...state.questionTimeRemaining, [questionId]: t },
    }));
  },
  lockQuestion: (questionId) => {
    set((state) => {
      const next = new Set(state.lockedQuestions);
      next.add(questionId);
      return { lockedQuestions: next };
    });
  },
  setIsSaving: (v) => set({ isSaving: v }),
  reset: () => set({ 
    ...initialState, 
    flaggedForReview: new Set<string>(),
    lockedQuestions: new Set<string>(),
  }),
}));