from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail, signing
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from study.models import GoalHistory, StudyInterval, StudySession, Subject, Topic
from study.services import preferences_for


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class AuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf(self):
        token = self.client.get('/api/v1/auth/csrf/').json()['csrfToken']
        self.client.credentials(HTTP_X_CSRFTOKEN=token)

    def test_anonymous_auth_mutations_require_csrf(self):
        for route in ['register', 'login', 'password-reset', 'reset-confirm', 'verify-email']:
            self.assertEqual(self.client.post(f'/api/v1/auth/{route}/', {}, format='json').status_code, 403)

    def test_registration_persistent_login_verification_logout(self):
        self.csrf()
        response = self.client.post('/api/v1/auth/register/', {
            'email': 'New@Example.com', 'first_name': 'Avery', 'password': 'calm-study-phrase-138'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(response.data['user']['email_verified'])
        self.assertTrue(self.client.cookies['sessionid']['httponly'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 200)
        self.client.credentials(HTTP_X_CSRFTOKEN=response.data['csrfToken'])
        user = get_user_model().objects.get(email='new@example.com')
        token = signing.dumps({'uid': user.pk, 'email': user.email}, salt='sesh.verify-email')
        self.assertEqual(self.client.post('/api/v1/auth/verify-email/', {'token': token}, format='json').status_code, 200)
        self.assertTrue(self.client.get('/api/v1/auth/me/').data['user']['email_verified'])
        self.assertEqual(self.client.post('/api/v1/auth/logout/').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 401)

    def test_login_case_normalization_and_failure(self):
        get_user_model().objects.create_user(username='person@example.com', email='person@example.com', password='calm-study-phrase-138')
        self.csrf()
        self.assertEqual(self.client.post('/api/v1/auth/login/', {'email': 'PERSON@Example.com', 'password': 'wrong'}, format='json').status_code, 401)
        self.assertEqual(self.client.post('/api/v1/auth/login/', {'email': 'PERSON@Example.com', 'password': 'calm-study-phrase-138'}, format='json').status_code, 200)

    def test_password_reset_is_private_and_single_use(self):
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.encoding import force_bytes
        from django.utils.http import urlsafe_base64_encode
        user = get_user_model().objects.create_user(username='person@example.com', email='person@example.com', password='old-study-phrase-138')
        self.csrf()
        known = self.client.post('/api/v1/auth/password-reset/', {'email': user.email}, format='json')
        unknown = self.client.post('/api/v1/auth/password-reset/', {'email': 'nobody@example.com'}, format='json')
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(mail.outbox), 1)
        payload = {'uid': urlsafe_base64_encode(force_bytes(user.pk)), 'token': default_token_generator.make_token(user),
                   'password': 'new-study-phrase-481'}
        self.assertEqual(self.client.post('/api/v1/auth/reset-confirm/', payload, format='json').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/auth/reset-confirm/', payload, format='json').status_code, 400)


class DataAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user('me@example.com', email='me@example.com', password='study-phrase-182')
        cls.other = get_user_model().objects.create_user('other@example.com', password='study-phrase-182')
        cls.subject = Subject.objects.create(user=cls.user, name='Mathematics')
        cls.other_subject = Subject.objects.create(user=cls.other, name='Private')
        cls.topic = Topic.objects.create(subject=cls.subject, name='Algebra')

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def manual(self):
        return self.client.post('/api/v1/sessions/', {'subject': self.subject.pk, 'topic': self.topic.pk,
            'started_at': (timezone.now() - timedelta(hours=2)).isoformat(), 'duration_seconds': 1800, 'note': 'Practice'}, format='json')

    def test_manual_edit_delete_updates_authoritative_intervals(self):
        response = self.manual()
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data['id']
        self.assertEqual(response.data['elapsed_seconds'], 1800)
        self.assertEqual(response.data['source'], 'manual')
        update = self.client.patch(f'/api/v1/sessions/{pk}/', {'duration_seconds': 2400, 'note': 'Updated'}, format='json')
        self.assertEqual(update.status_code, 200, update.data)
        self.assertEqual(update.data['elapsed_seconds'], 2400)
        self.assertEqual(StudyInterval.objects.filter(session_id=pk).count(), 1)
        self.assertEqual(self.client.delete(f'/api/v1/sessions/{pk}/').status_code, 204)
        self.assertFalse(StudyInterval.objects.filter(session_id=pk).exists())

    def test_subject_archiving_preserves_history_and_delete_is_safeguarded(self):
        self.manual()
        self.assertEqual(self.client.delete(f'/api/v1/subjects/{self.subject.pk}/', {'confirm': True}, format='json').status_code, 409)
        response = self.client.patch(f'/api/v1/subjects/{self.subject.pk}/', {'archived': True}, format='json')
        self.assertTrue(response.data['archived'])
        self.assertEqual(len(self.client.get('/api/v1/sessions/').data), 1)
        self.assertEqual(self.manual().status_code, 400)

    def test_cross_user_read_write_and_topic_ownership_are_blocked(self):
        self.assertEqual(self.client.patch(f'/api/v1/subjects/{self.other_subject.pk}/', {'name': 'Taken'}, format='json').status_code, 404)
        self.assertEqual(self.client.post('/api/v1/topics/', {'subject': self.other_subject.pk, 'name': 'No'}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/v1/sessions/start/', {'subject': self.other_subject.pk, 'mode': 'stopwatch'}, format='json').status_code, 400)
        other_topic = Topic.objects.create(subject=self.other_subject, name='Private topic')
        self.assertEqual(self.client.post('/api/v1/sessions/start/', {'subject': self.subject.pk, 'topic': other_topic.pk, 'mode': 'stopwatch'}, format='json').status_code, 400)
        other_session = StudySession.objects.create(user=self.other, subject=self.other_subject, mode='stopwatch')
        self.assertEqual(self.client.post(f'/api/v1/sessions/{other_session.pk}/finish/', {'revision': 0}, format='json').status_code, 404)

    def test_topics_cannot_be_moved_away_from_referenced_sessions(self):
        self.manual()
        new_subject = Subject.objects.create(user=self.user, name='Biology')
        response = self.client.patch(f'/api/v1/topics/{self.topic.pk}/', {'subject': new_subject.pk}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.delete(f'/api/v1/topics/{self.topic.pk}/').status_code, 409)

    def test_seconds_precision_start_and_duration_limits(self):
        base = {'subject': self.subject.pk, 'mode': 'pomodoro', 'target_seconds': 30, 'break_seconds': 10}
        for field, values in [('target_seconds', [0, -1, 86401]), ('break_seconds', [0, -1, 7201])]:
            for value in values:
                response = self.client.post('/api/v1/sessions/start/', {**base, field: value}, format='json')
                self.assertEqual(response.status_code, 400, response.data)
        response = self.client.post('/api/v1/sessions/start/', base, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['target_seconds'], 30)
        self.assertEqual(response.data['break_seconds'], 10)
        self.assertEqual(StudySession.objects.filter(user=self.user).count(), 1)

    def test_live_session_revision_and_resume_persistence(self):
        response = self.client.post('/api/v1/sessions/start/', {'subject': self.subject.pk, 'mode': 'stopwatch'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data['id']
        self.assertEqual(self.client.get('/api/v1/sessions/active/').data['id'], pk)
        pause = self.client.post(f'/api/v1/sessions/{pk}/pause/', {'revision': 0}, format='json')
        self.assertEqual(pause.data['status'], 'paused')
        stale = self.client.post(f'/api/v1/sessions/{pk}/resume/', {'revision': 0}, format='json')
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.client.patch(f'/api/v1/sessions/{pk}/', {'note': 'invalid'}, format='json').status_code, 409)
        self.assertEqual(self.client.delete(f'/api/v1/sessions/{pk}/').status_code, 409)

    def test_goal_changes_preserve_previous_days_and_validate_timezone(self):
        prefs = preferences_for(self.user)
        old_day = timezone.now().date() - timedelta(days=14)
        GoalHistory.objects.filter(user=self.user, kind='daily').delete()
        GoalHistory.objects.create(user=self.user, kind='daily', target_minutes=120, effective_from=old_day)
        response = self.client.patch('/api/v1/preferences/', {'daily_goal_minutes': 180, 'rest_days': [6, 6], 'timezone': 'Asia/Kathmandu'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rest_days'], [6])
        self.assertEqual(GoalHistory.objects.get(user=self.user, kind='daily', effective_from=old_day).target_minutes, 120)
        self.assertEqual(self.client.patch('/api/v1/preferences/', {'timezone': 'Invalid/Place'}, format='json').status_code, 400)

    def test_export_is_owned_and_account_delete_cascades_safely(self):
        self.manual()
        exported = self.client.get('/api/v1/export/')
        self.assertEqual(exported.status_code, 200)
        self.assertEqual([s['name'] for s in exported.data['subjects']], ['Mathematics'])
        self.assertEqual(self.client.delete('/api/v1/auth/account/', {'password': 'incorrect'}, format='json').status_code, 400)
        self.assertEqual(self.client.delete('/api/v1/auth/account/', {'password': 'study-phrase-182'}, format='json').status_code, 204)
        self.assertFalse(get_user_model().objects.filter(pk=self.user.pk).exists())
        self.assertTrue(get_user_model().objects.filter(pk=self.other.pk).exists())

    def test_input_validation_prevents_future_or_invalid_data(self):
        future = self.client.post('/api/v1/sessions/', {'subject': self.subject.pk, 'started_at': timezone.now().isoformat(), 'duration_seconds': 3600}, format='json')
        self.assertEqual(future.status_code, 400)
        self.assertEqual(self.client.post('/api/v1/subjects/', {'name': 'Color', 'color': 'red'}, format='json').status_code, 400)
        self.assertEqual(self.client.get('/api/v1/sessions/?from=bad').status_code, 400)
