from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from rest_framework.exceptions import ValidationError

from study.exceptions import Conflict
from study.models import StudyInterval, StudySession, Subject
from study.services import recovery_required, session_action, session_totals, start_session


class TimerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('timer@example.com', password='test-passphrase-123')
        cls.subject = Subject.objects.create(user=cls.user, name='Physics')

    def setUp(self):
        self.start = datetime(2026, 10, 20, 12, 0, tzinfo=dt_timezone.utc)

    def begin(self, mode='stopwatch', target=1500, break_seconds=300, event=None):
        with patch('study.services.timezone.now', return_value=self.start):
            return start_session(self.user, {'subject': self.subject, 'mode': mode,
                                 'target_seconds': target, 'break_seconds': break_seconds},
                                 {'client_event_id': event} if event else {})

    def act(self, session, seconds, action, **data):
        with patch('study.services.timezone.now', return_value=self.start + timedelta(seconds=seconds)):
            return session_action(self.user, session.pk, action, {'revision': session.revision, **data})

    def total(self, session, seconds):
        return session_totals(session, self.start + timedelta(seconds=seconds))['elapsed_seconds']

    def test_start_pause_resume_finish_excludes_pause(self):
        session = self.begin()
        session = self.act(session, 60, 'pause')
        self.assertEqual(self.total(session, 600), 60)
        session = self.act(session, 600, 'resume')
        session = self.act(session, 660, 'finish')
        self.assertEqual(session.status, 'completed')
        self.assertEqual(self.total(session, 700), 120)
        self.assertEqual(session.intervals.count(), 2)

    def test_heartbeat_does_not_change_revision(self):
        session = self.begin()
        session = self.act(session, 60, 'heartbeat')
        self.assertEqual(session.revision, 0)
        self.assertEqual(self.total(session, 120), 120)

    def test_sleep_never_counts_uncertain_time(self):
        session = self.begin()
        session = self.act(session, 30, 'heartbeat')
        session = self.act(session, 600, 'heartbeat')
        self.assertEqual(session.last_heartbeat_at, self.start + timedelta(seconds=30))
        self.assertTrue(recovery_required(session, self.start + timedelta(seconds=600)))
        self.assertEqual(self.total(session, 600), 30)
        with self.assertRaises(Conflict):
            self.act(session, 600, 'finish')
        session = self.act(session, 600, 'recover', count_elapsed=False)
        session = self.act(session, 660, 'finish')
        self.assertEqual(self.total(session, 660), 90)

    def test_confirming_sleep_includes_elapsed_once(self):
        session = self.begin()
        session = self.act(session, 600, 'recover', count_elapsed=True)
        session = self.act(session, 660, 'finish')
        self.assertEqual(self.total(session, 660), 660)

    def test_offline_finish_recovery_honors_client_cutoff(self):
        session = self.begin()
        session = self.act(session, 30, 'heartbeat')
        session = self.act(session, 900, 'recover', count_elapsed=True,
                           occurred_at=(self.start + timedelta(seconds=400)).isoformat(), after_action='finish')
        self.assertEqual(session.status, 'completed')
        self.assertEqual(session.ended_at, self.start + timedelta(seconds=400))
        self.assertEqual(self.total(session, 900), 400)

    def test_offline_pause_excludes_uncertainty_even_short_gap(self):
        session = self.begin()
        session = self.act(session, 30, 'heartbeat')
        session = self.act(session, 80, 'recover', count_elapsed=False,
                           occurred_at=(self.start + timedelta(seconds=70)).isoformat(), after_action='pause')
        self.assertEqual(session.status, 'paused')
        self.assertEqual(self.total(session, 80), 30)

    def test_offline_event_cannot_predate_confirmed_heartbeat(self):
        session = self.begin()
        session = self.act(session, 30, 'heartbeat')
        with self.assertRaises(ValidationError):
            self.act(session, 80, 'pause', occurred_at=self.start.isoformat())

    def test_countdown_is_capped_at_target(self):
        session = self.begin('countdown', target=60)
        session = self.act(session, 60, 'heartbeat')
        session = self.act(session, 500, 'finish')
        self.assertEqual(self.total(session, 500), 60)

    def test_pomodoro_breaks_never_count_as_focus(self):
        session = self.begin('pomodoro', target=60, break_seconds=30)
        session = self.act(session, 60, 'next-phase')
        self.assertEqual(session.phase, 'break')
        session = self.act(session, 90, 'next-phase')
        session = self.act(session, 150, 'finish')
        self.assertEqual(self.total(session, 150), 120)
        self.assertEqual(session.intervals.filter(kind='break').count(), 1)

    def test_stale_device_cannot_mutate_session(self):
        old = self.begin()
        current = self.act(old, 60, 'pause')
        with self.assertRaises(Conflict):
            self.act(old, 65, 'resume')
        self.assertEqual(current.revision, 1)

    def test_retry_event_is_idempotent_before_revision_check(self):
        session = self.begin(event='start-1')
        replay = self.begin(event='start-1')
        self.assertEqual(session.pk, replay.pk)
        done = self.act(session, 60, 'finish', client_event_id='finish-1')
        replay = self.act(session, 90, 'finish', client_event_id='finish-1')
        self.assertEqual(done.revision, replay.revision)
        self.assertEqual(self.total(replay, 90), 60)

    def test_prevents_overlapping_live_sessions_in_service_and_database(self):
        session = self.begin()
        with self.assertRaises(Conflict):
            self.begin()
        with self.assertRaises(IntegrityError), transaction.atomic():
            StudySession.objects.create(user=self.user, subject=self.subject, mode='stopwatch', status='paused')
        with self.assertRaises(IntegrityError), transaction.atomic():
            StudyInterval.objects.create(session=session, kind='focus', started_at=self.start)

    def test_discard_is_not_completed_and_allows_new_session(self):
        session = self.begin()
        session = self.act(session, 600, 'discard')
        self.assertEqual(session.status, 'discarded')
        self.assertEqual(self.total(session, 600), 0)
        self.assertNotEqual(self.begin().pk, session.pk)

    def test_long_break_after_four_focus_intervals(self):
        session = self.begin('pomodoro', target=60, break_seconds=30)
        moment = 0
        for cycle in range(4):
            moment += 60
            session = self.act(session, moment, 'next-phase')
            self.assertEqual(session.completed_focus_cycles, cycle + 1)
            if cycle < 3:
                moment += 30
                session = self.act(session, moment, 'next-phase')
        from study.services import phase_limit
        self.assertEqual(phase_limit(session), 900)
        self.assertEqual(self.total(session, moment), 240)
        with self.assertRaises(ValidationError):
            self.act(session, moment + 30, 'next-phase')
        for step in range(60, 901, 60):
            session = self.act(session, moment + step, 'heartbeat')
        session = self.act(session, moment + 900, 'next-phase')
        session = self.act(session, moment + 960, 'finish')
        self.assertEqual(self.total(session, moment + 960), 300)

    def test_premature_phase_transition_is_rejected(self):
        session = self.begin('pomodoro', target=60)
        with self.assertRaises(ValidationError):
            self.act(session, 10, 'next-phase')
        session.refresh_from_db()
        self.assertEqual(session.phase, 'focus')
        self.assertEqual(session.revision, 0)

    def test_recovery_retry_is_idempotent(self):
        session = self.begin()
        data = {'count_elapsed': True, 'after_action': 'finish',
                'occurred_at': (self.start + timedelta(seconds=75)).isoformat(),
                'client_event_id': 'recover-offline-finish'}
        first = self.act(session, 300, 'recover', **data)
        second = self.act(session, 400, 'recover', **data)
        self.assertEqual(first.id, second.id)
        self.assertEqual(self.total(second, 500), 75)
        self.assertEqual(second.intervals.count(), 1)
