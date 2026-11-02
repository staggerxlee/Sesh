from datetime import date, datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from study.analytics import AnalyticsService, split_interval, week_start_for
from study.models import GoalHistory, RestDayPreferences, StudyInterval, StudySession, Subject, Topic, UserPreferences


UTC = dt_timezone.utc


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


class AnalyticsTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='analytics', email='analytics@example.com')
        self.prefs = UserPreferences.objects.create(user=self.user, timezone='UTC', daily_goal_minutes=60, weekly_goal_minutes=300)
        self.subject = Subject.objects.create(user=self.user, name='Biology', color='#789B77', weekly_goal_minutes=120)
        self.now = instant('2026-10-27T15:00:00Z')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def session(self, start, seconds=3600, subject=None, user=None, topic=None, status='completed'):
        start = instant(start) if isinstance(start, str) else start
        end = start + timedelta(seconds=seconds)
        session = StudySession.objects.create(
            user=user or self.user, subject=subject or self.subject, topic=topic,
            status=status, mode='manual', source='manual', started_at=start,
            phase_started_at=start, ended_at=end, last_heartbeat_at=end,
        )
        StudyInterval.objects.create(session=session, kind='focus', started_at=start, ended_at=end)
        return session

    def service(self):
        return AnalyticsService(self.user, self.now)

    def test_kathmandu_midnight_uses_quarter_hour_offset(self):
        pieces = list(split_interval(instant('2026-10-26T18:00:00Z'), instant('2026-10-26T19:00:00Z'), ZoneInfo('Asia/Kathmandu')))
        self.assertEqual([part[0] for part in pieces], [date(2026, 10, 26), date(2026, 10, 27)])
        self.assertEqual([(end - start).total_seconds() for _, start, end in pieces], [900, 2700])

    def test_spring_daylight_saving_day_has_23_hours(self):
        pieces = list(split_interval(instant('2026-03-08T00:00:00-05:00'), instant('2026-03-09T00:00:00-04:00'), ZoneInfo('America/New_York')))
        self.assertEqual(len(pieces), 1)
        self.assertEqual((pieces[0][2] - pieces[0][1]).total_seconds(), 23 * 3600)

    def test_fall_daylight_saving_day_has_25_hours(self):
        pieces = list(split_interval(instant('2026-11-01T00:00:00-04:00'), instant('2026-11-02T00:00:00-05:00'), ZoneInfo('America/New_York')))
        self.assertEqual(len(pieces), 1)
        self.assertEqual((pieces[0][2] - pieces[0][1]).total_seconds(), 25 * 3600)

    def test_skipped_date_does_not_invent_elapsed_time(self):
        pieces = list(split_interval(instant('2011-12-29T23:00:00-10:00'), instant('2011-12-31T01:00:00+14:00'), ZoneInfo('Pacific/Apia')))
        self.assertEqual([piece[0] for piece in pieces], [date(2011, 12, 29), date(2011, 12, 31)])
        self.assertEqual(sum((end - start).total_seconds() for _, start, end in pieces), 7200)

    def test_midnight_session_counts_once_in_range_and_on_each_day(self):
        session = self.session('2026-10-26T23:30:00Z', 7200)
        result = self.service().summary(date(2026, 10, 26), date(2026, 10, 27))
        self.assertEqual([row['seconds'] for row in result['daily']], [1800, 5400])
        self.assertEqual(result['total_sessions'], 1)
        self.assertEqual(result['range_seconds'], 7200)
        self.assertEqual(result['average_session_seconds'], 7200)
        self.assertEqual([row['session_ids'] for row in result['daily']], [[session.id], [session.id]])

    def test_breaks_pauses_open_intervals_and_non_completed_sessions_do_not_count(self):
        session = self.session('2026-10-26T09:00:00Z', 1800)
        StudyInterval.objects.create(session=session, kind='break', started_at=instant('2026-10-26T09:30:00Z'), ended_at=instant('2026-10-26T09:40:00Z'))
        StudyInterval.objects.create(session=session, kind='focus', started_at=instant('2026-10-26T10:00:00Z'), ended_at=instant('2026-10-26T10:20:00Z'))
        StudyInterval.objects.create(session=session, kind='focus', started_at=instant('2026-10-26T10:30:00Z'))
        self.session('2026-10-26T11:00:00Z', status='discarded')
        self.session('2026-10-26T12:00:00Z', status='active')
        result = self.service().summary(date(2026, 10, 26), date(2026, 10, 26))
        self.assertEqual(result['range_seconds'], 3000)
        self.assertEqual(result['total_sessions'], 1)
        self.assertEqual(result['longest_session_seconds'], 3000)

    def test_fractional_seconds_are_conserved_between_days_and_session(self):
        self.session('2026-10-26T23:59:59.400000Z', 1.7)
        result = self.service().summary(date(2026, 10, 26), date(2026, 10, 27))
        self.assertEqual(result['range_seconds'], 1)
        self.assertEqual(sum(day['seconds'] for day in result['daily']), 1)
        self.assertEqual(sum(subject['seconds'] for subject in result['subjects']), 1)

    def test_historical_daily_goals_preserve_old_achievement(self):
        GoalHistory.objects.create(user=self.user, kind='daily', target_minutes=60, effective_from=date(2026, 10, 1))
        GoalHistory.objects.create(user=self.user, kind='daily', target_minutes=120, effective_from=date(2026, 10, 20))
        self.prefs.daily_goal_minutes = 120
        self.prefs.save()
        self.session('2026-10-19T09:00:00Z', 5400)
        self.session('2026-10-20T09:00:00Z', 5400)
        result = self.service().summary(date(2026, 10, 19), date(2026, 10, 20))
        self.assertEqual([row['goal_minutes'] for row in result['daily']], [60, 120])
        self.assertEqual([row['goal_achieved'] for row in result['daily']], [True, False])
        self.assertEqual(result['goal_achievement_rate'], 50)

    def test_historical_weekly_goal_and_subject_goal_used_by_review(self):
        for kind, subject, target, effective in [
            ('weekly', None, 120, date(2026, 10, 5)),
            ('weekly', None, 300, date(2026, 10, 12)),
            ('weekly', self.subject, 60, date(2026, 10, 5)),
            ('weekly', self.subject, 120, date(2026, 10, 12)),
        ]:
            GoalHistory.objects.create(user=self.user, subject=subject, kind=kind, target_minutes=target, effective_from=effective)
        self.session('2026-10-06T09:00:00Z', 10800)
        review = self.service().review(date(2026, 10, 5))
        self.assertEqual(review['weekly_goal_minutes'], 120)
        self.assertEqual(review['weekly_goal_percent'], 150)
        self.assertEqual(review['subjects'][0]['weekly_goal_minutes'], 60)
        self.assertEqual(review['subjects'][0]['weekly_goal_percent'], 300)

    def test_rest_days_preserve_streak_without_inventing_study_days(self):
        RestDayPreferences.objects.create(user=self.user, weekday=5)
        RestDayPreferences.objects.create(user=self.user, weekday=6)
        for day in [22, 23, 26]:
            self.session(f'2026-10-{day}T09:00:00Z')
        self.assertEqual(self.service().streaks(), (3, 3))
        self.now = instant('2026-10-28T15:00:00Z')
        self.assertEqual(self.service().streaks(), (0, 3))

    def test_unplanned_rest_day_breaks_streak(self):
        RestDayPreferences.objects.create(user=self.user, weekday=5)
        self.session('2026-10-23T09:00:00Z')
        self.session('2026-10-26T09:00:00Z')
        self.assertEqual(self.service().streaks(), (1, 1))

    def test_studying_on_planned_rest_day_counts_real_activity(self):
        RestDayPreferences.objects.create(user=self.user, weekday=6)
        for day in [24, 25, 26]:
            self.session(f'2026-10-{day}T09:00:00Z')
        result = self.service().summary(date(2026, 10, 24), date(2026, 10, 26))
        self.assertEqual(result['current_streak'], 3)
        self.assertTrue(result['daily'][1]['is_rest_day'])
        self.assertEqual(result['goal_achievement_rate'], 100)

    def test_review_excludes_incomplete_week_and_accepts_completed_week(self):
        self.session('2026-10-19T09:00:00Z')
        self.session('2026-10-26T09:00:00Z')
        service = self.service()
        self.assertEqual([review['week_start'] for review in service.reviews()], ['2026-10-19'])
        with self.assertRaises(ValueError):
            service.review(date(2026, 10, 26))
        self.now = instant('2026-10-25T23:59:00Z')
        with self.assertRaises(ValueError):
            self.service().review(date(2026, 10, 19))

    def test_sunday_week_preference_controls_review_boundaries(self):
        self.prefs.week_start = 6
        self.prefs.save()
        self.session('2026-10-24T09:00:00Z')
        self.session('2026-10-25T09:00:00Z', 7200)
        review = self.service().review(date(2026, 10, 20))
        self.assertEqual(review['week_start'], '2026-10-18')
        self.assertEqual(review['week_end'], '2026-10-24')
        self.assertEqual(review['total_seconds'], 3600)
        self.assertEqual(week_start_for(date(2026, 10, 25), 6), date(2026, 10, 25))

    def test_session_edits_and_deletion_recalculate_every_report(self):
        session = self.session('2026-10-19T09:00:00Z')
        interval = session.intervals.get()
        self.assertEqual(self.service().review(date(2026, 10, 19))['total_seconds'], 3600)
        interval.ended_at += timedelta(hours=1)
        interval.save()
        service = self.service()
        self.assertEqual(service.summary(date(2026, 10, 19), date(2026, 10, 19))['range_seconds'], 7200)
        self.assertEqual(service.daily(date(2026, 10, 19), date(2026, 10, 19))[0]['seconds'], 7200)
        self.assertEqual(service.review(date(2026, 10, 19))['total_seconds'], 7200)
        session.delete()
        self.assertEqual(self.service().review(date(2026, 10, 19))['total_seconds'], 0)
        self.assertEqual(self.service().streaks(), (0, 0))

    def test_ownership_filters_sessions_subjects_goals_and_reviews(self):
        other = get_user_model().objects.create_user(username='other')
        other_subject = Subject.objects.create(user=other, name='Private subject')
        self.session('2026-10-19T09:00:00Z', 36000, subject=other_subject, user=other)
        GoalHistory.objects.create(user=other, kind='daily', target_minutes=1, effective_from=date(2026, 1, 1))
        self.session('2026-10-19T09:00:00Z')
        result = self.service().summary(date(2026, 10, 19), date(2026, 10, 19))
        self.assertEqual(result['all_time_seconds'], 3600)
        self.assertEqual([row['name'] for row in result['subjects']], ['Biology'])
        self.assertEqual(result['daily'][0]['goal_minutes'], 60)
        self.assertEqual(self.service().review(date(2026, 10, 19))['total_seconds'], 3600)

    def test_subject_topics_archival_and_date_filtered_trends(self):
        topic = Topic.objects.create(subject=self.subject, name='Cell division')
        self.session('2026-10-19T09:00:00Z', 3600, topic=topic)
        self.session('2026-10-20T09:00:00Z', 1800)
        self.session('2026-10-26T09:00:00Z', 7200)
        self.subject.archived = True
        self.subject.save()
        result = self.service().summary(date(2026, 10, 19), date(2026, 10, 20))
        subject = result['subjects'][0]
        self.assertEqual(subject['seconds'], 5400)
        self.assertEqual(subject['percent'], 100)
        self.assertEqual(subject['weekly_seconds'], 7200)
        self.assertEqual(subject['monthly_seconds'], 12600)
        self.assertEqual(subject['topics'], [{'id': topic.id, 'name': 'Cell division', 'seconds': 3600}])
        self.assertEqual([row['seconds'] for row in subject['daily']], [3600, 1800])
        self.assertEqual(subject['weekly'], [{'date': '2026-10-19', 'seconds': 5400}])

    def test_empty_account_has_zeros_and_no_invented_insights(self):
        result = self.service().summary(date(2026, 10, 26), date(2026, 10, 27))
        for key in ['range_seconds', 'total_sessions', 'active_days', 'average_session_seconds', 'longest_session_seconds', 'goal_achievement_rate', 'current_streak']:
            self.assertEqual(result[key], 0)
        for key in ['most_productive_day', 'most_productive_weekday', 'common_study_window', 'week_change_percent']:
            self.assertIsNone(result[key])
        self.assertEqual(self.service().reviews(), [])

    def test_average_daily_includes_zero_days_and_comparisons_are_explicit(self):
        self.session('2026-10-19T09:00:00Z', 7200)
        self.session('2026-10-26T09:00:00Z', 3600)
        result = self.service().summary(date(2026, 10, 26), date(2026, 10, 27))
        self.assertEqual(result['average_daily_seconds'], 1800)
        self.assertEqual(result['previous_week_seconds'], 7200)
        self.assertEqual(result['week_difference_seconds'], -3600)
        self.assertEqual(result['week_change_percent'], -50)
        self.assertTrue(result['week_in_progress'])

    def test_most_common_window_counts_duration_across_window_boundary(self):
        self.session('2026-10-26T11:00:00Z', 3 * 3600)
        result = self.service().summary(date(2026, 10, 26), date(2026, 10, 26))
        self.assertEqual(result['common_study_window'], {'label': '12:00–15:00', 'start_hour': 12, 'end_hour': 15, 'seconds': 7200})
        self.assertEqual(result['most_productive_weekday']['name'], 'Monday')

    def test_calendar_api_exposes_midnight_continuation_session(self):
        session = self.session('2026-10-26T23:30:00Z', 7200)
        response = self.client.get('/api/v1/calendar/', {'from': '2026-10-27', 'to': '2026-10-27'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['days'][0]['seconds'], 5400)
        self.assertEqual(response.data['days'][0]['session_ids'], [session.id])
        self.assertEqual([row['id'] for row in response.data['sessions']], [session.id])

    def test_api_rejects_bad_and_unbounded_ranges(self):
        for query in [
            {'from': '2026-10-28', 'to': '2026-10-27'},
            {'from': '2025-01-01', 'to': '2026-10-27'},
            {'from': '2026-02-30'},
            {'from': '20261027'},
        ]:
            with self.subTest(query=query):
                self.assertEqual(self.client.get('/api/v1/analytics/', query).status_code, 400)
        self.assertEqual(self.client.get('/api/v1/calendar/', {'from': '2024-01-01', 'to': '2024-12-31'}).status_code, 200)

    def test_authenticated_endpoints_do_not_leak_other_users_data(self):
        other = get_user_model().objects.create_user(username='private')
        subject = Subject.objects.create(user=other, name='Secret name')
        session = self.session('2026-10-19T09:00:00Z', user=other, subject=subject)
        with patch('study.analytics.timezone.now', return_value=self.now):
            for endpoint in ['analytics', 'calendar']:
                response = self.client.get(f'/api/v1/{endpoint}/', {'from': '2026-10-19', 'to': '2026-10-19'})
                self.assertEqual(response.status_code, 200)
                self.assertNotIn('Secret name', str(response.data))
                records = response.data['recent_sessions' if endpoint == 'analytics' else 'sessions']
                self.assertNotIn(session.id, [row['id'] for row in records])
            self.assertEqual(self.client.get('/api/v1/reviews/').data, [])
        self.client.force_authenticate(None)
        for endpoint in ['analytics', 'calendar', 'reviews']:
            self.assertEqual(self.client.get(f'/api/v1/{endpoint}/').status_code, 401)

    def test_reviews_api_returns_selected_complete_week_only(self):
        self.session('2026-10-19T09:00:00Z')
        with patch('study.analytics.timezone.now', return_value=self.now):
            response = self.client.get('/api/v1/reviews/', {'week': '2026-10-20'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['week_start'], '2026-10-19')
            self.assertEqual(response.data['total_seconds'], 3600)
            self.assertEqual(self.client.get('/api/v1/reviews/', {'week': '2026-10-26'}).status_code, 400)
