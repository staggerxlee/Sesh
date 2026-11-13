from datetime import date, timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from study.analytics import AnalyticsService
from study.calendar_report import chapter, archive_details
from study.models import CalendarNote, GoalHistory, RestDayPreferences, StudyInterval, StudySession, Subject, UserPreferences
from .test_analytics import instant


class CalendarTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='calendar')
        UserPreferences.objects.create(user=self.user, timezone='UTC', daily_goal_minutes=60)
        self.subject = Subject.objects.create(user=self.user, name='Mathematics')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.now = instant('2026-11-12T12:00:00Z')

    def session(self, start, seconds):
        start = instant(start)
        end = start + timedelta(seconds=seconds)
        session = StudySession.objects.create(user=self.user, subject=self.subject, status='completed', mode='manual', source='manual', started_at=start, phase_started_at=start, ended_at=end, last_heartbeat_at=end)
        StudyInterval.objects.create(session=session, kind='focus', started_at=start, ended_at=end)
        return session

    def test_elapsed_comparison_day_totals_and_best_weekday(self):
        self.session('2026-10-12T10:00:00Z', 3600)
        self.session('2026-10-13T10:00:00Z', 36000)  # Outside comparable elapsed dates.
        self.session('2026-11-03T08:00:00Z', 3600)
        self.session('2026-11-03T13:00:00Z', 3600)
        self.session('2026-11-04T08:00:00Z', 5400)
        result = chapter(AnalyticsService(self.user, self.now), date(2026, 11, 1))
        self.assertEqual(result['days_studied'], 2)
        self.assertEqual(result['previous_seconds'], 3600)
        self.assertEqual(result['change_percent'], 250)
        self.assertEqual(result['comparison_to'], '2026-10-12')
        self.assertEqual(result['best_weekday'], 'Tuesday')
        self.assertEqual(result['longest_day']['seconds'], 7200)
        self.assertEqual(result['longest_day']['date'], '2026-11-03')

    def test_consistency_excludes_rest_and_future_and_goal_uses_schedule(self):
        RestDayPreferences.objects.create(user=self.user, weekday=6)
        GoalHistory.objects.create(user=self.user, kind='daily', target_minutes=60, effective_from=date(2026, 11, 1))
        GoalHistory.objects.create(user=self.user, kind='daily', target_minutes=120, effective_from=date(2026, 11, 10))
        self.session('2026-11-01T08:00:00Z', 3600)  # Sunday: actual time, outside denominator.
        self.session('2026-11-02T08:00:00Z', 3600)
        result = chapter(AnalyticsService(self.user, self.now), date(2026, 11, 1))
        self.assertEqual(result['elapsed_days'], 12)
        self.assertEqual(result['eligible_days'], 10)
        self.assertEqual(result['consistency_percent'], 10)
        self.assertEqual(result['goals_met'], 1)
        self.assertEqual(result['goal_seconds'], (7 * 60 + 18 * 120) * 60)
        self.assertIsNone(result['change_percent'])

    def test_empty_future_leap_and_month_end(self):
        service = AnalyticsService(self.user, self.now)
        self.assertEqual(len(chapter(service, date(2024, 2, 1))['days']), 29)
        self.assertEqual(len(chapter(service, date(2025, 2, 1))['days']), 28)
        future = chapter(service, date(2027, 1, 1))
        self.assertEqual(future['elapsed_days'], 0)
        self.assertEqual(future['consistency_percent'], 0)
        self.assertIsNone(future['longest_day'])
        self.assertIsNone(future['best_weekday'])
        self.assertEqual(future['subjects'], [])

    def test_archive_allocates_midnight_and_separates_breaks_pauses(self):
        session = self.session('2026-11-03T23:30:00Z', 3600)
        StudyInterval.objects.create(session=session, kind='break', started_at=instant('2026-11-04T00:30:00Z'), ended_at=instant('2026-11-04T00:40:00Z'))
        session.ended_at = instant('2026-11-04T00:50:00Z')
        session.save()
        result = archive_details(AnalyticsService(self.user, self.now), date(2026, 11, 3), date(2026, 11, 4))
        self.assertEqual(result['allocations']['2026-11-03'][session.id], 1800)
        self.assertEqual(result['allocations']['2026-11-04'][session.id], 1800)
        self.assertEqual(result['daily_bounds']['2026-11-04']['first_focus'], instant('2026-11-04T00:00:00Z'))
        self.assertEqual(result['daily_bounds']['2026-11-04']['last_focus'], instant('2026-11-04T00:30:00Z'))
        self.assertEqual(result['accounting'][session.id], dict(focus_seconds=3600, break_seconds=600, paused_seconds=600, wall_seconds=4800))

    def test_focus_timeline_omits_breaks_and_pauses(self):
        session = self.session('2026-11-04T10:00:00Z', 1800)
        StudyInterval.objects.create(session=session, kind='break', started_at=instant('2026-11-04T10:30:00Z'), ended_at=instant('2026-11-04T10:40:00Z'))
        StudyInterval.objects.create(session=session, kind='focus', started_at=instant('2026-11-04T11:00:00Z'), ended_at=instant('2026-11-04T11:30:00Z'))
        session.ended_at = instant('2026-11-04T11:30:00Z')
        session.save()
        result = archive_details(AnalyticsService(self.user, self.now), date(2026, 11, 4), date(2026, 11, 4))
        marks = result['focus_intervals']['2026-11-04']
        self.assertEqual([mark['offset_seconds'] for mark in marks], [36000, 39600])
        self.assertEqual(sum(mark['span_seconds'] for mark in marks), 3600)
        self.assertEqual(result['accounting'][session.id]['wall_seconds'], 5400)

    def test_timeline_uses_actual_dst_day_windows(self):
        prefs = UserPreferences.objects.get(user=self.user)
        prefs.timezone = 'America/New_York'
        prefs.save()
        self.session('2026-11-01T05:30:00Z', 7200)
        self.session('2026-03-08T06:30:00Z', 7200)
        service = AnalyticsService(self.user, self.now)
        fall = archive_details(service, date(2026, 11, 1), date(2026, 11, 1))
        spring = archive_details(service, date(2026, 3, 8), date(2026, 3, 8))
        self.assertEqual(fall['day_windows']['2026-11-01']['seconds'], 25 * 3600)
        self.assertEqual(spring['day_windows']['2026-03-08']['seconds'], 23 * 3600)
        self.assertEqual(fall['focus_intervals']['2026-11-01'][0]['span_seconds'], 7200)
        self.assertEqual(spring['focus_intervals']['2026-03-08'][0]['span_seconds'], 7200)

    def test_historical_archive_still_labels_current_streak(self):
        self.session('2026-11-10T09:00:00Z', 1800)
        self.session('2026-11-11T09:00:00Z', 1800)
        result = archive_details(AnalyticsService(self.user, self.now), date(2026, 10, 1), date(2026, 10, 31))
        self.assertEqual(result['streak']['current'], 2)
        self.assertEqual(result['streak']['as_of'], '2026-11-12')
        self.assertEqual(result['focus_intervals'], {})

    def test_api_rejects_bad_month_and_exposes_chapter(self):
        for month in ['not-a-date', '2026-02-30', '0001-01-01', '9999-12-01']:
            self.assertEqual(self.client.get('/api/v1/calendar/', {'month': month}).status_code, 400)
        with patch('study.analytics.timezone.now', return_value=self.now):
            response = self.client.get('/api/v1/calendar/', {'from': '2026-11-01', 'to': '2026-11-30', 'month': '2026-11-01'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.data['chapter']['days']), 30)

    def test_note_create_read_edit_clear_and_compare_and_swap(self):
        path = '/api/v1/calendar/notes/'
        key = {'kind': 'daily', 'date': '2026-11-03'}
        self.assertEqual(self.client.get(path, key).data['revision'], 0)
        first = self.client.patch(path, {**key, 'text': 'First thought', 'revision': 0}, format='json')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['revision'], 1)
        stale = self.client.patch(path, {**key, 'text': 'Other device', 'revision': 0}, format='json')
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data['current']['text'], 'First thought')
        self.assertEqual(CalendarNote.objects.count(), 1)
        self.client.patch(path, {**key, 'text': 'Revised', 'revision': 1}, format='json')
        self.assertEqual(self.client.get(path, key).data['text'], 'Revised')
        self.client.patch(path, {**key, 'text': '', 'revision': 2}, format='json')
        saved = self.client.get(path, key).data
        self.assertEqual(saved['text'], '')
        self.assertEqual(saved['revision'], 3)
        self.assertEqual(self.client.patch(path, {**key, 'text': 'Restore stale', 'revision': 1}, format='json').status_code, 409)

    def test_private_notes_and_date_keys(self):
        path = '/api/v1/calendar/notes/'
        key = {'kind': 'monthly', 'date': '2026-11-01'}
        self.client.patch(path, {**key, 'text': 'Private', 'revision': 0, 'cover': 'lily'}, format='json')
        other = get_user_model().objects.create_user(username='other-calendar')
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(path, key).data['text'], '')
        self.client.patch(path, {**key, 'text': 'Different', 'revision': 0}, format='json')
        self.client.force_authenticate(self.user)
        saved = self.client.get(path, key).data
        self.assertEqual((saved['text'], saved['cover']), ('Private', 'lily'))
        for payload in [
            {**key, 'date': '2026-11-02'}, {**key, 'date': '2026-02-30'},
            {'kind': 'motto', 'date': '2026-11-01'},
            {'kind': 'motto', 'date': '2000-01-01', 'text': 'x' * 241},
        ]:
            self.assertEqual(self.client.patch(path, {'revision': 0, 'text': '', **payload}, format='json').status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(path, key).status_code, 401)
        self.assertEqual(self.client.patch(path, {**key, 'revision': 0, 'text': 'no'}, format='json').status_code, 401)


# Exercise the same first-write race as two devices creating the same day's note.
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from django.db import connection, connections, close_old_connections
from django.test import TransactionTestCase


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL concurrent writes')
class CalendarNoteConcurrencyTests(TransactionTestCase):
    def test_two_devices_cannot_overwrite_or_duplicate_a_new_note(self):
        user = get_user_model().objects.create_user(username='calendar-concurrent')
        gate = Barrier(2)

        def save(index):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(get_user_model().objects.get(pk=user.pk))
                gate.wait(timeout=5)
                response = client.patch('/api/v1/calendar/notes/', {
                    'kind': 'daily', 'date': '2026-11-12', 'text': f'Device {index}', 'revision': 0,
                }, format='json')
                return response.status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(save, [1, 2]))
        self.assertEqual(sorted(statuses), [200, 409])
        self.assertEqual(CalendarNote.objects.count(), 1)
        self.assertEqual(CalendarNote.objects.get().revision, 1)
