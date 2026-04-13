// ── Database entity types ──

export interface Course {
  id: string;
  name: string;
  description: string;
  department_id: string;
  created_at: string;
}

export interface Test {
  id: string;
  name: string;               // DB uses 'name' not 'title'
  course_id: string;
  template_id: string | null;
  created_by: string | null;
  is_published: boolean;
  total_marks: number | null;
  start_time: string | null;  // ISO timestamp
  end_time: string | null;    // ISO timestamp
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  course_id: string;
  created_by: string;
  template_type: string;
  duration_minutes: number;
  total_questions: number;
  marks_per_question: number;
  negative_marking_enabled: boolean;
  negative_marking_penalty: number;
  negative_marking: number;
  passing_percentage: number;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  allow_review: boolean;
  show_results_immediately: boolean;
  lock_section_navigation: boolean;
  prevent_tab_switch: boolean;
  strict_proctoring: boolean;
  has_sections: boolean;
  sections_config: any;
  time_per_question: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestQuestion {
  id: string;
  test_id: string;
  question_id: string;
  marks: number;
  created_at: string;
}

export interface TestAttempt {
  id: string;
  test_id: string;
  student_id: string;
  score: number | null;
  violations: number;
  started_at: string;
  submitted_at: string | null;
  created_at: string;
}

export interface Answer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_option: string;
  answered_at: string;
  is_correct: boolean | null;
  marks_awarded: number | null;
}

export interface TestAssignment {
  id: string;
  test_id: string;
  student_id: string;
  status: 'assigned' | 'in_progress' | 'submitted' | 'evaluated';
  assigned_at: string;
  started_at: string | null;
  submitted_at: string | null;
  score: number | null;
  created_at: string;
}

export interface TestSchedule {
  id: string;
  test_id: string;
  availability_start: string;
  availability_end: string;
  time_zone: string;
  is_active: boolean;
  created_at: string;
}

export interface Student {
  id: string;
  user_id: string;
  course_id: string;
  enrollment_number: string;
  created_at: string;
}

export interface Teacher {
  id: string;
  user_id: string;
  course_id: string;
  created_at: string;
}

export interface User {
  id: string;
  auth_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  created_at: string;
}

// ── UI / store types ──

export interface Question {
  id: string;
  course_id: string;
  created_by: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string;
  difficulty: string;
  topic: string;
  image_url: string | null;
  source_type: string;
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
  // NO section_id — not in DB
}

export interface TestStoreState {
  testId: string | null;
  attemptId: string | null;
  questions: Question[];
  // NO sections[] — not in DB
  currentQuestionIndex: number;
  selectedOptions: Record<string, string>;
  flaggedForReview: Set<string>;
  remainingTime: number;
  timePerQuestion: number | null;
  questionTimeRemaining: Record<string, number>;
  lockedQuestions: Set<string>;
  isSaving: boolean;
  testSettings: {
    lockSectionNavigation: boolean;
    showResultsImmediately: boolean;
    durationMinutes: number;
  } | null;
}

export interface TestStoreActions {
  init: (params: {
    testId: string;
    attemptId: string;
    questions: Question[];
    totalDuration: number;
    settings: TestStoreState['testSettings'];
    timePerQuestion?: number | null;
    savedAnswers?: Record<string, string>;
  }) => void;
  selectOption: (questionId: string, optionText: string) => void;
  toggleFlag: (questionId: string) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  jumpToQuestion: (index: number) => void;
  setRemainingTime: (t: number) => void;
  extendTime: (delta: number) => void;
  setQuestionTimeRemaining: (questionId: string, t: number) => void;
  lockQuestion: (questionId: string) => void;
  setIsSaving: (v: boolean) => void;
  reset: () => void;
}

export type NavigationParamList = {
  Login: undefined;
  Dashboard: undefined;
  TestEngine: { testId: string };
  Results: { attemptId: string; testId: string };
};