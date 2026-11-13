import io
import json
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMessage
from django.test import SimpleTestCase, override_settings

from study.email_backend import BrevoEmailBackend


@override_settings(BREVO_API_KEY='test-only-key', EMAIL_TIMEOUT=10)
class AccountEmailTests(SimpleTestCase):
    def message(self):
        return EmailMessage('Verify your email', 'Your private verification link.',
                            'Sesh <sender@example.com>', ['Friend <friend@example.com>'])

    @patch('study.email_backend.urlopen')
    def test_account_mail_uses_https_and_provider_acceptance(self, open_url):
        open_url.return_value.__enter__.return_value = io.BytesIO(b'{"messageId":"test-message"}')
        self.assertEqual(BrevoEmailBackend().send_messages([self.message()]), 1)
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, 'https://api.brevo.com/v3/smtp/email')
        self.assertEqual(request.get_header('Api-key'), 'test-only-key')
        self.assertEqual(open_url.call_args.kwargs['timeout'], 10)
        payload = json.loads(request.data)
        self.assertEqual(payload['sender'], {'name': 'Sesh', 'email': 'sender@example.com'})
        self.assertEqual(payload['to'], [{'email': 'friend@example.com'}])
        self.assertEqual(payload['textContent'], self.message().body)

    @override_settings(BREVO_API_KEY='')
    @patch('study.email_backend.urlopen')
    def test_missing_key_fails_before_network(self, open_url):
        with self.assertRaises(ImproperlyConfigured):
            BrevoEmailBackend().send_messages([self.message()])
        self.assertEqual(BrevoEmailBackend(fail_silently=True).send_messages([self.message()]), 0)
        open_url.assert_not_called()

    @patch('study.email_backend.urlopen')
    def test_provider_and_network_failures_are_not_success(self, open_url):
        for failure in (HTTPError('https://api.brevo.com', 403, 'Forbidden', {}, None),
                        URLError('Unavailable'), TimeoutError()):
            with self.subTest(failure=type(failure).__name__):
                open_url.side_effect = failure
                with self.assertRaisesRegex(RuntimeError, 'Account email delivery failed'):
                    BrevoEmailBackend().send_messages([self.message()])
                self.assertEqual(BrevoEmailBackend(fail_silently=True).send_messages([self.message()]), 0)

    @patch('study.email_backend.urlopen')
    def test_unaccepted_message_is_not_reported_sent(self, open_url):
        open_url.return_value.__enter__.return_value = io.BytesIO(b'{}')
        with self.assertRaisesRegex(RuntimeError, 'did not accept'):
            BrevoEmailBackend().send_messages([self.message()])

    @patch('study.email_backend.urlopen')
    def test_empty_recipients_do_not_send(self, open_url):
        message = self.message()
        message.to = []
        self.assertEqual(BrevoEmailBackend().send_messages([message]), 0)
        open_url.assert_not_called()
