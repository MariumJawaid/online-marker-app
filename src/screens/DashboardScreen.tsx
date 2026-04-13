import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SectionList,
  RefreshControl,
  StatusBar,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { NavigationParamList } from '../types';

type Props = NativeStackScreenProps<NavigationParamList, 'Dashboard'>;

interface TestWithMeta {
  id: string;
  name: string;
  durationMinutes: number;
  totalMarks: number | null;
  availabilityStart: Date | null;
  availabilityEnd: Date | null;
  isPublished: boolean;
}

interface CategorisedSection {
  title: string;
  data: TestWithMeta[];
}

export default function DashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sections, setSections] = useState<CategorisedSection[]>([]);

  const fetchTests = useCallback(async () => {
    try {
      if (!profile) return;

      // 1. Fetch ALL courses the student is enrolled in
      console.log('[Dashboard] Fetching enrollments for user_id:', profile.userId);
      const { data: enrollments, error: enrollErr } = await supabase
        .from('students')
        .select('course_id')
        .eq('user_id', profile.userId);

      console.log('[Dashboard] Enrollments result:', { enrollments, enrollErr });

      if (enrollErr || !enrollments?.length) {
        setSections([]);
        return;
      }

      const courseIds = enrollments.map(e => e.course_id).filter(Boolean);
      console.log('[Dashboard] Student enrolled in courses:', courseIds);

      // 2. Get tests for ALL enrolled courses that are published
      const { data: rawTests, error: testErr } = await supabase
        .from('tests')
        .select('id, name, total_marks, is_published, template_id, start_time, end_time, course_id')
        .in('course_id', courseIds)
        .eq('is_published', true);

      if (testErr || !rawTests?.length) {
        setSections([]);
        return;
      }

      // 3. Fetch template durations for all tests in one query
      const templateIds = [...new Set(rawTests.map((t) => t.template_id).filter(Boolean))];
      const { data: templates } = await supabase
        .from('templates')
        .select('id, duration_minutes')
        .in('id', templateIds);

      const durationMap: Record<string, number> = {};
      for (const tmpl of templates ?? []) {
        durationMap[tmpl.id] = tmpl.duration_minutes;
      }

      // 4. Fetch schedules for these tests
      const testIds = rawTests.map((t) => t.id);
      const { data: schedules } = await supabase
        .from('test_schedules')
        .select('test_id, availability_start, availability_end, is_active')
        .in('test_id', testIds)
        .eq('is_active', true);

      const scheduleMap: Record<string, { start: Date; end: Date }> = {};
      for (const s of schedules ?? []) {
        scheduleMap[s.test_id] = {
          start: new Date(s.availability_start),
          end: new Date(s.availability_end),
        };
      }

      // 5. Get the student's user_id (attempts table stores user_id in student_id column)
      const { data: studentRecord } = await supabase
        .from('students')
        .select('user_id')
        .eq('id', profile.studentId)
        .single();

      const studentUserId = studentRecord?.user_id || profile.userId;
      console.log('[Dashboard] Student ID:', profile.studentId, '→ User ID:', studentUserId);
      
      // Fetch submitted attempts with user_id
      const { data: attempts, error: attemptsErr } = await supabase
        .from('attempts')
        .select('test_id, submitted_at, id, student_id')
        .eq('student_id', studentUserId)
        .in('test_id', testIds)
        .not('submitted_at', 'is', null);

      console.log('[Dashboard] Submitted attempts query result:', attempts);
      console.log('[Dashboard] Submitted attempts query error:', attemptsErr);

      const submittedTestIds = new Set((attempts ?? []).map((a) => a.test_id));
      console.log('[Dashboard] Submitted test IDs:', Array.from(submittedTestIds));

      // 6. Build enriched test list
      const tests: TestWithMeta[] = rawTests.map((t) => ({
        id: t.id,
        name: t.name,
        durationMinutes: durationMap[t.template_id] ?? 60,
        totalMarks: t.total_marks,
        availabilityStart: scheduleMap[t.id]?.start ?? (t.start_time ? new Date(t.start_time) : null),
        availabilityEnd: scheduleMap[t.id]?.end ?? (t.end_time ? new Date(t.end_time) : null),
        isPublished: t.is_published,
      }));

      // 7. Categorise
      const now = new Date();
      const active: TestWithMeta[]    = [];
      const upcoming: TestWithMeta[]  = [];
      const completed: TestWithMeta[] = [];

      for (const t of tests) {
        const start = t.availabilityStart;
        const end   = t.availabilityEnd;

        if (submittedTestIds.has(t.id)) {
          completed.push(t);
        } else if (end && now > end) {
          completed.push(t);
        } else if (start && now < start) {
          upcoming.push(t);
        } else {
          // No schedule or within window = active
          active.push(t);
        }
      }

      setSections([
        { title: '🟢  Active', data: active },
        { title: '🕐  Upcoming', data: upcoming },
        { title: '✅  Completed', data: completed },
      ].filter((s) => s.data.length > 0)); // hide empty sections

    } catch (err) {
      console.error('[Dashboard] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => { fetchTests(); }, [fetchTests]);

  // ── Refresh tests whenever dashboard comes into focus ──
  useFocusEffect(
    useCallback(() => {
      console.log('[Dashboard] Refreshing tests on focus');
      fetchTests();
    }, [fetchTests])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTests();
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  // ── Renders ──

  const renderItem = ({ item, section }: { item: TestWithMeta; section: CategorisedSection }) => {
  const isActive    = section.title.includes('Active');
  const isCompleted = section.title.includes('Completed');

  const handlePress = async () => {
    if (isActive) {
      navigation.navigate('TestEngine', { testId: item.id });
      return;
    }

    if (isCompleted) {
      // Fetch the attemptId for this test to navigate to results
      const { data: attempt, error } = await supabase
        .from('attempts')
        .select('id')
        .eq('test_id', item.id)
        .eq('student_id', profile?.userId ?? '')
        .not('submitted_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !attempt) {
        Alert.alert('Error', 'Could not find your result for this test.');
        return;
      }

      navigation.navigate('Results', { attemptId: attempt.id, testId: item.id });
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isActive && styles.cardActive,
        isCompleted && styles.cardCompleted,
      ]}
      activeOpacity={isActive || isCompleted ? 0.7 : 1}
      disabled={!isActive && !isCompleted}   // upcoming stays disabled
      onPress={handlePress}
    >
      <Text style={styles.cardTitle}>{item.name}</Text>

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>⏱ {item.durationMinutes} min</Text>
        {item.totalMarks != null && (
          <Text style={styles.metaText}>📝 {item.totalMarks} marks</Text>
        )}
      </View>

      {item.availabilityStart && item.availabilityEnd && (
        <Text style={styles.windowText}>
          {item.availabilityStart.toLocaleDateString()} –{' '}
          {item.availabilityEnd.toLocaleDateString()}
        </Text>
      )}

      {isActive && (
        <View style={styles.startBadge}>
          <Text style={styles.startBadgeText}>TAP TO START →</Text>
        </View>
      )}

      {isCompleted && (
        <View style={styles.completedBadge}>
          <Text style={styles.completedBadgeText}>VIEW RESULTS →</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
  const renderSectionHeader = ({ section }: { section: CategorisedSection }) => (
    <Text style={styles.sectionHeader}>{section.title}</Text>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Hello, {profile?.name ?? 'Student'} 👋</Text>
          <Text style={styles.enrollmentText}>{profile?.enrollmentNumber}</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No tests available for your course.</Text>
          </View>
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
          />
        }
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0F172A' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#1A2340',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  greeting:       { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  enrollmentText: { fontSize: 13, color: '#A0AEC0', marginTop: 2 },
  signOutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#7F1D1D',
  },
  signOutText:    { color: '#FCA5A5', fontSize: 13, fontWeight: 'bold' },
  list:           { padding: 20, paddingBottom: 40 },
  sectionHeader:  { fontSize: 14, fontWeight: 'bold', color: '#E0E7FF', marginTop: 24, marginBottom: 12, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#1A2340',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  cardActive:    { borderWidth: 1.5, borderColor: '#3B82F6' },
  cardCompleted: { opacity: 0.7 },
  cardTitle:     { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 12 },
  cardMeta:      { flexDirection: 'row', gap: 20, marginBottom: 12 },
  metaItem:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText:      { fontSize: 14, color: '#A0AEC0' },
  windowText:    { fontSize: 12, color: '#64748B', fontStyle: 'italic' },
  startBadge: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  startBadgeText:     { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  completedBadge: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#1F593D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  completedBadgeText: { color: '#86EFAC', fontSize: 14, fontWeight: 'bold' },
  emptyText:          { color: '#A0AEC0', fontSize: 15, textAlign: 'center', marginTop: 40 },
});

