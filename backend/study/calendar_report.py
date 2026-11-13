"""Editorial calendar metrics, derived from the authoritative focus chunks."""
from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from .analytics import WEEKDAYS, change_percentage, percentage


def chapter(service, month):
    start = month.replace(day=1)
    end = month.replace(day=monthrange(month.year, month.month)[1])
    cutoff = min(end, service.today)
    days = service.daily(start, end)
    elapsed = [row for row in days if row['date'] <= service.today.isoformat()]
    eligible = [row for row in elapsed if not row['is_rest_day']]
    active = [row for row in elapsed if row['seconds'] > 0]
    previous_end = start - timedelta(days=1)
    previous_start = previous_end.replace(day=1)
    comparison_end = previous_end
    if cutoff < end:
        comparison_end = previous_end.replace(day=min(max(1, cutoff.day), previous_end.day))
    previous_seconds = service.seconds_between(previous_start, comparison_end) if cutoff >= start else 0
    seconds = service.seconds_between(start, cutoff)
    by_weekday = defaultdict(int)
    for row in active:
        by_weekday[date.fromisoformat(row['date']).weekday()] += row['seconds']
    best = max(by_weekday, key=by_weekday.get) if by_weekday else None
    longest = max(active, key=lambda row: row['seconds']) if active else None
    subjects = service.subject_breakdown(start, end)
    return {
        'month': start.isoformat(), 'days': days, 'seconds': seconds,
        'days_studied': len(active), 'elapsed_days': len(elapsed),
        'eligible_days': len(eligible),
        'consistency_percent': percentage(sum(row['seconds'] > 0 for row in eligible), len(eligible)),
        'previous_seconds': previous_seconds, 'change_percent': change_percentage(seconds, previous_seconds),
        'comparison_from': previous_start.isoformat(), 'comparison_to': comparison_end.isoformat(),
        'comparison_label': 'same elapsed days last month' if cutoff < end else 'the previous full month',
        'best_weekday': WEEKDAYS[best] if best is not None else None,
        'longest_day': longest, 'subjects': [row for row in subjects if row['seconds'] > 0],
        'goal_seconds': sum(row['goal_minutes'] * 60 for row in days if not row['is_rest_day']),
        'goals_met': sum(row['goal_achieved'] for row in eligible),
        'session_count': len(service.sessions_between(start, end)),
    }


def archive_details(service, start, end):
    allocations = defaultdict(lambda: defaultdict(int))
    bounds = {}
    intervals = defaultdict(list)
    windows = {}
    for day, began, finished, session_id, _, _, seconds in service.chunks:
        if start <= day <= end:
            allocations[day.isoformat()][session_id] += seconds
            key = day.isoformat()
            day_start = datetime.combine(day, time.min, tzinfo=service.tz).astimezone(timezone.utc)
            day_end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=service.tz).astimezone(timezone.utc)
            windows[key] = {'started_at': day_start, 'ended_at': day_end,
                            'seconds': int((day_end - day_start).total_seconds())}
            intervals[key].append({'session_id': session_id, 'started_at': began,
                'ended_at': finished, 'seconds': seconds,
                'offset_seconds': (began - day_start).total_seconds(),
                'span_seconds': (finished - began).total_seconds()})
            previous = bounds.get(key)
            bounds[key] = {
                'first_focus': min(began, previous['first_focus']) if previous else began,
                'last_focus': max(finished, previous['last_focus']) if previous else finished,
            }
    accounting = {}
    for session in service.sessions_between(start, end):
        focus = breaks = 0
        for interval in session.intervals.all():
            if interval.ended_at:
                seconds = (interval.ended_at - interval.started_at).total_seconds()
                if interval.kind == 'focus':
                    focus += seconds
                else:
                    breaks += seconds
        wall = int((session.ended_at - session.started_at).total_seconds()) if session.ended_at else None
        accounting[session.id] = {'focus_seconds': int(focus), 'break_seconds': int(breaks),
            'paused_seconds': max(0, wall - int(focus) - int(breaks)) if wall is not None else None,
            'wall_seconds': wall}
    current, longest = service.streaks()
    return {'allocations': dict(allocations), 'accounting': accounting, 'daily_bounds': bounds,
            'focus_intervals': {key: sorted(rows, key=lambda row: row['offset_seconds']) for key, rows in intervals.items()},
            'day_windows': windows,
            'streak': {'current': current, 'longest': longest, 'as_of': service.today.isoformat()}}
