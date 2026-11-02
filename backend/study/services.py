"""Authoritative interval accounting. A heartbeat gap never silently accrues focus."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from .exceptions import Conflict
from .models import GoalHistory, SessionEvent, StudyGoal, StudyInterval, StudySession, UserPreferences

HEARTBEAT_GRACE_SECONDS = 90


def preferences_for(user):
    prefs, created = UserPreferences.objects.get_or_create(user=user)
    if created:
        today = timezone.localtime(user.date_joined, ZoneInfo(prefs.timezone)).date()
        for kind, target in [('daily', prefs.daily_goal_minutes), ('weekly', prefs.weekly_goal_minutes)]:
            effective = today if kind == 'daily' else today - timedelta(days=(today.weekday() - prefs.week_start) % 7)
            set_goal(user, kind, target, effective)
    return prefs


def set_goal(user, kind, target, effective_from, subject=None):
    lookup = {'user': user, 'subject': subject, 'kind': kind}
    StudyGoal.objects.update_or_create(**lookup, defaults={'target_minutes': target, 'effective_from': effective_from})
    GoalHistory.objects.update_or_create(**lookup, effective_from=effective_from, defaults={'target_minutes': target})


def goal_effective_date(prefs, kind, now=None):
    today = timezone.localtime(now or timezone.now(), ZoneInfo(prefs.timezone)).date()
    return today if kind == 'daily' else today - timedelta(days=(today.weekday() - prefs.week_start) % 7)


def phase_limit(session):
    if session.phase == 'break':
        return session.long_break_seconds if session.completed_focus_cycles and session.completed_focus_cycles % 4 == 0 else session.break_seconds
    return session.target_seconds if session.mode in ['countdown', 'pomodoro'] else None


def interval_list(session):
    return list(session.intervals.all())


def closed_phase_seconds(session, intervals):
    return sum(max(0, (i.ended_at - max(i.started_at, session.phase_started_at)).total_seconds())
               for i in intervals if i.ended_at and i.kind == session.phase and i.ended_at > session.phase_started_at)


def recovery_required(session, now=None, intervals=None):
    now = now or timezone.now()
    if session.status != 'active' or (now - session.last_heartbeat_at).total_seconds() <= HEARTBEAT_GRACE_SECONDS:
        return False
    intervals = intervals if intervals is not None else interval_list(session)
    limit = phase_limit(session)
    if limit is not None:
        known = closed_phase_seconds(session, intervals)
        for item in intervals:
            if item.ended_at is None:
                known += max(0, (session.last_heartbeat_at - item.started_at).total_seconds())
        if known >= limit:
            return False
    return True


def effective_open_end(session, interval, now, intervals, include_uncertain=False):
    end = now
    if not include_uncertain and recovery_required(session, now, intervals):
        end = min(end, session.last_heartbeat_at)
    limit = phase_limit(session)
    if limit is not None:
        remaining = max(0, limit - closed_phase_seconds(session, intervals))
        end = min(end, interval.started_at + timedelta(seconds=remaining))
    return max(interval.started_at, end)


def session_totals(session, now=None):
    now = now or timezone.now()
    intervals = interval_list(session)
    focused = phase = 0.0
    for item in intervals:
        end = item.ended_at or effective_open_end(session, item, now, intervals)
        seconds = max(0, (end - item.started_at).total_seconds())
        if item.kind == 'focus':
            focused += seconds
        if item.kind == session.phase and end > session.phase_started_at:
            phase += max(0, (end - max(item.started_at, session.phase_started_at)).total_seconds())
    return {'elapsed_seconds': int(focused), 'phase_elapsed_seconds': int(phase),
            'recovery_required': recovery_required(session, now, intervals)}


def close_interval(session, now, include_uncertain=False):
    intervals = interval_list(session)
    for item in intervals:
        if item.ended_at is None:
            item.ended_at = effective_open_end(session, item, now, intervals, include_uncertain)
            item.save(update_fields=['ended_at'])
    # Invalidate prefetched intervals, including after a state change in a test/request.
    session._prefetched_objects_cache = {}


def validate_revision(session, data):
    revision = data.get('revision')
    if revision is None:
        raise ValidationError({'revision': 'Send the current session revision.'})
    if isinstance(revision, bool) or str(revision) != str(session.revision):
        raise Conflict({'detail': 'This session changed in another tab or device. Its latest state has been restored.',
                        'code': 'stale_revision', 'revision': session.revision})


def event_for(user, data, action, session_id=None):
    event_id = data.get('client_event_id')
    if event_id is None:
        return None, None
    if not isinstance(event_id, str) or not event_id.strip() or len(event_id) > 100:
        raise ValidationError({'client_event_id': 'Use a non-empty string of at most 100 characters.'})
    event = SessionEvent.objects.filter(user=user, client_event_id=event_id).select_related('session').first()
    if event and (event.action != action or (session_id and event.session_id != session_id)):
        raise Conflict('This event identifier was already used for a different action.')
    return event_id, event


def record_event(user, event_id, action, session):
    if event_id:
        SessionEvent.objects.create(user=user, client_event_id=event_id, action=action, session=session)


@transaction.atomic
def start_session(user, validated, raw_data):
    get_user_model().objects.select_for_update().get(pk=user.pk)
    event_id, event = event_for(user, raw_data, 'start')
    if event:
        return event.session
    if StudySession.objects.filter(user=user, status__in=['active', 'paused']).exists():
        raise Conflict({'detail': 'You already have a session in progress.', 'code': 'active_session_exists'})
    now = timezone.now()
    validated = {**validated, 'long_break_seconds': preferences_for(user).long_break * 60}
    session = StudySession.objects.create(user=user, started_at=now, phase_started_at=now, last_heartbeat_at=now, **validated)
    StudyInterval.objects.create(session=session, kind='focus', started_at=now)
    record_event(user, event_id, 'start', session)
    return session


@transaction.atomic
def session_action(user, session_id, action, data):
    get_user_model().objects.select_for_update().get(pk=user.pk)
    from django.shortcuts import get_object_or_404
    session = get_object_or_404(StudySession.objects.select_for_update(), user=user, pk=session_id)
    event_id, event = event_for(user, data, action, session_id)
    if event:
        return event.session
    validate_revision(session, data)
    now = timezone.now()
    action_at = now
    if data.get('occurred_at') is not None:
        value = data['occurred_at']
        try:
            action_at = parse_datetime(value) if isinstance(value, str) else None
        except (ValueError, TypeError):
            action_at = None
        if not action_at or timezone.is_naive(action_at):
            raise ValidationError({'occurred_at': 'Use an ISO timestamp including its timezone.'})
        if action_at < session.last_heartbeat_at or action_at > now:
            raise ValidationError({'occurred_at': 'The event must fall between the last server heartbeat and now.'})
    if action in ['finish', 'discard'] and session.status == ('completed' if action == 'finish' else 'discarded'):
        return session
    if session.status not in ['active', 'paused']:
        raise Conflict('This session has already ended.')
    uncertain = recovery_required(session, now)
    if uncertain and action not in ['recover', 'discard', 'heartbeat']:
        raise Conflict({'detail': 'Confirm whether the time away should count before continuing.', 'code': 'recovery_required'})
    if action == 'heartbeat':
        if not uncertain and session.status == 'active':
            session.last_heartbeat_at = now
            session.save(update_fields=['last_heartbeat_at'])
        record_event(user, event_id, action, session)
        return session
    if action == 'pause':
        if session.status == 'paused':
            return session
        close_interval(session, action_at)
        session.status = 'paused'
    elif action == 'resume':
        if session.status == 'active':
            return session
        StudyInterval.objects.create(session=session, kind=session.phase, started_at=now)
        session.status = 'active'
    elif action in ['finish', 'discard']:
        close_interval(session, action_at)
        session.status = 'completed' if action == 'finish' else 'discarded'
        session.ended_at = action_at
        if action == 'finish' and 'note' in data:
            if not isinstance(data['note'], str) or len(data['note']) > 5000:
                raise ValidationError({'note': 'Keep your note under 5,000 characters.'})
            session.note = data['note']
    elif action == 'recover':
        if type(data.get('count_elapsed')) is not bool:
            raise ValidationError({'count_elapsed': 'Choose whether elapsed time should count.'})
        if session.status != 'active':
            raise Conflict('Only an active session can be recovered.')
        after_action = data.get('after_action')
        if after_action not in [None, 'pause', 'finish']:
            raise ValidationError({'after_action': 'Choose pause or finish, or omit this field.'})
        # Always close/reopen: explicitly accepting elapsed time cannot be silently
        # lost if a second interruption occurs before the following heartbeat.
        cutoff = action_at if data['count_elapsed'] else session.last_heartbeat_at
        close_interval(session, cutoff, include_uncertain=True)
        if after_action:
            session.status = 'paused' if after_action == 'pause' else 'completed'
            if after_action == 'finish':
                session.ended_at = action_at
        else:
            StudyInterval.objects.create(session=session, kind=session.phase, started_at=now)
    elif action == 'next-phase':
        if session.mode != 'pomodoro':
            raise ValidationError('Only Pomodoro sessions have a next phase.')
        if session_totals(session, now)['phase_elapsed_seconds'] < phase_limit(session):
            raise ValidationError('Complete this interval before moving to the next phase.')
        close_interval(session, now)
        if session.phase == 'focus':
            session.completed_focus_cycles += 1
        session.phase = 'break' if session.phase == 'focus' else 'focus'
        session.phase_started_at = now
        session.status = 'active'
        StudyInterval.objects.create(session=session, kind=session.phase, started_at=now)
    else:
        raise ValidationError('Unknown timer action.')
    session.last_heartbeat_at = now
    session.revision += 1
    session.save()
    record_event(user, event_id, action, session)
    return session
