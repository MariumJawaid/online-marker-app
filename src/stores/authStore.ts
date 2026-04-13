import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface StudentProfile {
  // from users table
  userId: string;
  name: string;
  email: string;
  role: string;
  // from students table
  studentId: string;
  enrollmentNumber: string;
  courseId: string;
}

interface AuthState {
  session: any | null;
  profile: StudentProfile | null;
  loading: boolean;
  error: string | null;
}

interface AuthActions {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  session: null,
  profile: null,
  loading: false,
  error: null,

  loadSession: async () => {
    set({ loading: true });

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      set({ session: null, profile: null, loading: false });
      return;
    }

    const profile = await fetchStudentProfile(session.user.id);
    set({ session, profile, loading: false });
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.session) {
      set({ error: error?.message ?? 'Login failed', loading: false });
      return;
    }

    const profile = await fetchStudentProfile(data.session.user.id);

    if (!profile) {
      set({ error: 'No student account found for this email.', loading: false });
      await supabase.auth.signOut();
      return;
    }

    if (profile.role !== 'student') {
      set({ error: 'This app is for students only.', loading: false });
      await supabase.auth.signOut();
      return;
    }

    set({ session: data.session, profile, loading: false });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },

  clearError: () => set({ error: null }),
}));

// ── Helper: auth.users.id → users → students ──────────────────────────────

async function fetchStudentProfile(authId: string): Promise<StudentProfile | null> {
  // 1. Get users row via auth_id
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('auth_id', authId)
    .single();

  if (userErr || !userRow) {
    console.error('[fetchStudentProfile] users lookup failed:', userErr?.message);
    return null;
  }

  // 2. Get first students row via user_id (handles multiple enrollments)
  const { data: studentRows, error: studentErr } = await supabase
    .from('students')
    .select('id, enrollment_number, course_id')
    .eq('user_id', userRow.id);

  if (studentErr || !studentRows?.length) {
    console.error('[fetchStudentProfile] students lookup failed:', studentErr?.message);
    return null;
  }

  const studentRow = studentRows[0]; // Use first enrollment as primary

  return {
    userId: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: userRow.role,
    studentId: studentRow.id,
    enrollmentNumber: studentRow.enrollment_number,
    courseId: studentRow.course_id,
  };
}