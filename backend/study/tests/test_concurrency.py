from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from django.contrib.auth import get_user_model
from django.db import connection, connections, close_old_connections
from django.test import TransactionTestCase
from study.exceptions import Conflict
from study.models import Subject, StudySession
from study.services import start_session, session_action

@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class DeviceConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('concurrent@sesh.invalid',password='test-only-passphrase-651')
        self.subject = Subject.objects.create(user=self.user,name='Concurrency')

    def run_together(self, worker):
        barrier = Barrier(2)
        def task(index):
            close_old_connections()
            try:
                user = get_user_model().objects.get(pk=self.user.pk)
                barrier.wait(timeout=5)
                try:
                    return worker(user,index)
                except Conflict:
                    return 'conflict'
            finally:
                connections.close_all()
        with ThreadPoolExecutor(max_workers=2) as executor:
            return list(executor.map(task,range(2)))

    def test_two_devices_cannot_start_overlapping_sessions(self):
        result = self.run_together(lambda user,i:start_session(user,{'subject':self.subject,'mode':'stopwatch'},{'client_event_id':f'start-{i}'}).pk)
        self.assertEqual(result.count('conflict'),1)
        self.assertEqual(StudySession.objects.filter(user=self.user,status='active').count(),1)

    def test_concurrent_same_event_returns_one_session(self):
        result = self.run_together(lambda user,i:start_session(user,{'subject':self.subject,'mode':'stopwatch'},{'client_event_id':'same-start'}).pk)
        self.assertEqual(result[0],result[1])
        self.assertEqual(StudySession.objects.filter(user=self.user).count(),1)

    def test_two_devices_cannot_apply_same_revision_twice(self):
        session = start_session(self.user,{'subject':self.subject,'mode':'stopwatch'},{})
        result = self.run_together(lambda user,i:session_action(user,session.pk,'pause',{'revision':0,'client_event_id':f'pause-{i}'}).revision)
        self.assertEqual(result.count('conflict'),1)
        session.refresh_from_db()
        self.assertEqual(session.status,'paused')
        self.assertEqual(session.revision,1)
