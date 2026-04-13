import { supabase } from '../lib/supabase';
import { Test, Template, Question } from '../types';

export interface FullTestConfig {
  test: Test;
  template: Template | null;
  questions: Question[];         // ordered by test_questions join
  marksPerQuestion: Record<string, number>; // questionId → marks
}

export class TestBuilder {
  private testId: string;

  constructor(testId: string) {
    this.testId = testId;
  }

  async build(): Promise<FullTestConfig> {
    // 1. Fetch test
    const { data: test, error: testError } = await supabase
      .from('tests')
      .select('*')
      .eq('id', this.testId)
      .single();

    if (testError || !test) throw new Error('Test not found');

    // 2. Fetch template (sections_config lives here as jsonb)
    let template: Template | null = null;
    if (test.template_id) {
      const { data: templateData } = await supabase
        .from('templates')
        .select('*')
        .eq('id', test.template_id)
        .single();
      template = templateData ?? null;
    }

    // 3. Fetch question IDs + per-question marks via join table
    const { data: testQuestions, error: tqError } = await supabase
      .from('test_questions')
      .select('question_id, marks')
      .eq('test_id', this.testId);

    if (tqError) throw tqError;
    if (!testQuestions?.length) {
      return { test, template, questions: [], marksPerQuestion: {} };
    }

    const questionIds = testQuestions.map((tq) => tq.question_id);

    // Build marks lookup
    const marksPerQuestion: Record<string, number> = {};
    for (const tq of testQuestions) {
      marksPerQuestion[tq.question_id] = Number(tq.marks);
    }

    // 4. Fetch actual question rows
    const { data: questions, error: qError } = await supabase
      .from('questions')
      .select('*')
      .in('id', questionIds);

    if (qError) throw qError;

    // 5. Preserve order from test_questions (DB order, or shuffle later)
    const questionMap = new Map((questions ?? []).map((q) => [q.id, q]));
    const orderedQuestions = questionIds
      .map((id) => questionMap.get(id))
      .filter((q): q is Question => !!q);

    return {
      test,
      template,
      questions: orderedQuestions,
      marksPerQuestion,
    };
  }
}