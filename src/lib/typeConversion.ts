/**
 * Converts string booleans from Supabase to actual boolean values.
 * Supabase may return boolean fields as strings ('true' / 'false') depending on the client library.
 */
export function toBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
}

/**
 * Converts a Test object from Supabase, ensuring all boolean fields are actual booleans.
 * Handles both snake_case (DB columns) and camelCase (app-side) field names.
 */
export function normalizeTest(test: any): any {
  // Resolve values from either snake_case or camelCase keys
  const lockVal = test.lock_section_navigation ?? test.lockSectionNavigation;
  const showVal = test.show_results_immediately ?? test.showResultsImmediately;

  return {
    ...test,
    // Always output camelCase keys with proper boolean values
    lockSectionNavigation: toBoolean(lockVal),
    showResultsImmediately: toBoolean(showVal),
    // Ensure total_duration is a number
    total_duration: Number(test.total_duration) || 0,
  };
}

/**
 * Converts an Answer object from Supabase, ensuring boolean fields are actual booleans.
 */
export function normalizeAnswer(answer: any): any {
  const isCorrectVal = answer.is_correct;
  return {
    ...answer,
    is_correct: isCorrectVal == null ? null : toBoolean(isCorrectVal),
  };
}
