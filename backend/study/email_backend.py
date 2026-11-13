"""Transactional account mail over HTTPS for hosts that block SMTP ports."""
import json
from email.utils import parseaddr
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend


class BrevoEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages or []:
            if not message.recipients():
                continue
            try:
                if not settings.BREVO_API_KEY:
                    raise ImproperlyConfigured('Set BREVO_API_KEY to enable account emails.')
                if message.attachments or getattr(message, 'alternatives', None):
                    raise ValueError('Sesh account emails support plain text only.')
                name, address = parseaddr(message.from_email)
                payload = {
                    'sender': {'email': address, 'name': name or 'Sesh'},
                    'subject': message.subject,
                    'textContent': message.body,
                }
                for field in ('to', 'cc', 'bcc', 'reply_to'):
                    addresses = getattr(message, field, [])
                    if addresses:
                        values = [{'email': parseaddr(value)[1]} for value in addresses]
                        if field == 'reply_to':
                            payload['replyTo'] = values[0]
                        else:
                            payload[field] = values
                request = Request(
                    'https://api.brevo.com/v3/smtp/email',
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json', 'Accept': 'application/json',
                             'api-key': settings.BREVO_API_KEY},
                    method='POST',
                )
                try:
                    with urlopen(request, timeout=settings.EMAIL_TIMEOUT) as response:
                        result = json.load(response)
                    if not result.get('messageId'):
                        raise RuntimeError('Email provider did not accept the message.')
                except (HTTPError, URLError, TimeoutError, ValueError):
                    # Never put provider response bodies, email content or keys in logs.
                    raise RuntimeError('Account email delivery failed; check the email provider configuration.') from None
                sent += 1
            except (ImproperlyConfigured, ValueError, RuntimeError):
                if not self.fail_silently:
                    raise
        return sent
