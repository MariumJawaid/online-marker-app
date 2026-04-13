import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { Test, TestAssignment } from '../types';

export const useDashboardData = () => {
  const [tests, setTests] = useState<Test[]>([]);
  const [assignments, setAssignments] = useState<TestAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { studentId, courseId, setLocked } = useAuthStore();

  const fetchDashboardData = async () => {
    if (!studentId || !courseId) return;

    setLoading(true);
    try {
      // Security: Join test_assignments and students to ensure student only sees their tests
      // We fetch tests that match the student's course AND have an assignment for this student
      const { data, error: fetchError } = await supabase
        .from('tests')
        .select(`
          *,
          test_assignments!inner (
            id,
            status,
            submitted_at,
            student_id
          )
        `)
        .eq('course_id', courseId)
        .eq('test_assignments.student_id', studentId);

      if (fetchError) throw fetchError;

      setTests(data as Test[]);
      
      // Map assignments for quick access
      const userAssignments = data.map(t => (t as any).test_assignments[0]);
      setAssignments(userAssignments);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // 4. Observer: Subscribe to test_assignments for this student
    if (!studentId) return;

    const subscription = supabase
      .channel(`student_assignments_${studentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'test_assignments',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          console.log('Assignment update received:', payload);
          // If status changes to 'submitted' via Admin portal, we need to refresh or notify
          // The UI components using this hook can react to assignment updates
          fetchDashboardData();
          
          if (payload.new.status === 'submitted') {
            setLocked(true);
          } else {
            setLocked(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [studentId, courseId]);

  return { tests, assignments, loading, error, refresh: fetchDashboardData };
};
