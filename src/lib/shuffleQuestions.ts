import { Question } from '../types';

/**
 * Deterministic shuffle seeded by attemptId.
 * Same student always sees the same order within one attempt,
 * but different from other students.
 */
function seededRandom(seed: string): () => number {
  // Simple hash of the seed string → number
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  // LCG random from seed
  return () => {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    return ((h >>> 0) / 0xffffffff);
  };
}

export function shuffleQuestions(questions: Question[], attemptId: string): Question[] {
  const arr    = [...questions];
  const random = seededRandom(attemptId);

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

export function shuffleOptions(question: Question, attemptId: string): Question {
  const options: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
  const random = seededRandom(attemptId + question.id);

  // Shuffle the letter order
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  // Build new question with shuffled option positions
  const letterToText: Record<string, string> = {
    A: question.option_a,
    B: question.option_b,
    C: question.option_c,
    D: question.option_d,
  };

  const correctText = letterToText[question.correct_option.toUpperCase()];

  const newQuestion = {
    ...question,
    option_a: letterToText[options[0]],
    option_b: letterToText[options[1]],
    option_c: letterToText[options[2]],
    option_d: letterToText[options[3]],
  };

  // Update correct_option to reflect new position
  const newCorrectLetter = (['A', 'B', 'C', 'D'] as const).find(
    (l, idx) => letterToText[options[idx]] === correctText
  );
  newQuestion.correct_option = newCorrectLetter ?? question.correct_option;

  return newQuestion;
}