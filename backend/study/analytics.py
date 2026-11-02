"""Authoritative, on-demand reports derived solely from completed focus intervals.

All elapsed arithmetic happens in UTC. Only calendar boundaries are interpreted in
the account's timezone, which keeps both midnight and daylight-saving splits exact.
No report snapshots are used: editing or deleting a session updates every report.
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db.models import Prefetch
from django.utils import timezone

from .models import GoalHistory, RestDayPreferences, StudyGoal, StudyInterval, StudySession, Subject
from .services import preferences_for


UTC = dt_timezone.utc
WEEKDAYS = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')


def dates_between(start, end):
    for offset in range((end - start).days + 1):
        yield start + timedelta(days=offset)


def week_start_for(day, first_weekday=0):
    return day - timedelta(days=(day.weekday() - first_weekday) % 7)


def split_interval(start, end, tz):
    """Yield (local date, UTC start, UTC end) without assuming 24-hour days."""
    cursor = start.astimezone(UTC)
    end = end.astimezone(UTC)
    while cursor < end:
        local_day = cursor.astimezone(tz).date()
        following = local_day + timedelta(days=1)
        boundary = datetime.combine(following, time.min, tzinfo=tz).astimezone(UTC)
        # Some timezone changes skip a calendar date entirely.
        while boundary <= cursor:
            following += timedelta(days=1)
            boundary = datetime.combine(following, time.min, tzinfo=tz).astimezone(UTC)
        stop = min(end, boundary)
        yield local_day, cursor, stop
        cursor = stop


def percentage(actual, target):
    return round(actual / target * 100, 1) if target else 0.0


def change_percentage(actual, previous):
    # A zero baseline cannot support a percentage growth claim.
    return round((actual - previous) / previous * 100, 1) if previous else None


class AnalyticsService:
    def __init__(self, user, now=None):
        self.user = user
        self.now = now or timezone.now()
        self.preferences = preferences_for(user)
        try:
            self.tz = ZoneInfo(self.preferences.timezone)
        except ZoneInfoNotFoundError:
            self.tz = ZoneInfo('UTC')
        self.today = self.now.astimezone(self.tz).date()
        self.week_start = week_start_for(self.today, self.preferences.week_start)
        self.month_start = self.today.replace(day=1)
        self.rest_days = set(RestDayPreferences.objects.filter(user=user).values_list('weekday', flat=True))
        self.subjects = {subject.id: subject for subject in Subject.objects.filter(user=user)}
        self.sessions = list(
            StudySession.objects.filter(user=user, status='completed')
            .select_related('subject', 'topic')
            .prefetch_related(Prefetch('intervals', queryset=StudyInterval.objects.order_by('started_at', 'id')))
            .order_by('-started_at', '-id')
        )
        self.session_by_id = {session.id: session for session in self.sessions}
        self.goal_history = defaultdict(list)
        for goal in GoalHistory.objects.filter(user=user).order_by('effective_from', 'id'):
            self.goal_history[(goal.kind, goal.subject_id)].append((goal.effective_from, goal.target_minutes))
        for goal in StudyGoal.objects.filter(user=user).order_by('effective_from', 'id'):
            if not self.goal_history[(goal.kind, goal.subject_id)]:
                self.goal_history[(goal.kind, goal.subject_id)].append((goal.effective_from, goal.target_minutes))
        self.day_seconds = defaultdict(float)
        self.day_sessions = defaultdict(set)
        self.chunks = []
        for session in self.sessions:
            cumulative_seconds = 0.0
            allocated_seconds = 0
            for interval in session.intervals.all():
                if interval.kind != 'focus' or not interval.ended_at:
                    continue
                for local_day, start, end in split_interval(interval.started_at, interval.ended_at, self.tz):
                    # Allocate whole seconds with a carried fraction so calendar,
                    # history and report totals agree with the session serializer.
                    cumulative_seconds += (end - start).total_seconds()
                    seconds = int(cumulative_seconds) - allocated_seconds
                    allocated_seconds += seconds
                    if seconds <= 0:
                        continue
                    self.day_seconds[local_day] += seconds
                    self.day_sessions[local_day].add(session.id)
                    self.chunks.append((local_day, start, end, session.id, session.subject_id, session.topic_id, seconds))

    def goal_for(self, day, kind='daily', subject_id=None):
        history = self.goal_history[(kind, subject_id)]
        if history:
            # Manual history predating registration inherits the first known target.
            target = history[0][1]
            for effective_from, minutes in history:
                if effective_from > day:
                    break
                target = minutes
            return target
        if subject_id is not None:
            subject = self.subjects.get(subject_id)
            return subject.weekly_goal_minutes if subject else 0
        return getattr(self.preferences, f'{kind}_goal_minutes')

    def seconds_between(self, start, end):
        return round(sum(seconds for day, seconds in self.day_seconds.items() if start <= day <= end))

    def daily(self, start, end):
        result = []
        for day in dates_between(start, end):
            seconds = self.day_seconds.get(day, 0)
            goal = self.goal_for(day)
            result.append({
                'date': day.isoformat(),
                'seconds': round(seconds),
                'goal_minutes': goal,
                'goal_achieved': goal > 0 and seconds >= goal * 60,
                'is_rest_day': day.weekday() in self.rest_days,
                'session_count': len(self.day_sessions.get(day, ())),
                'session_ids': sorted(self.day_sessions.get(day, ())),
            })
        return result

    def session_totals(self, start, end):
        totals = defaultdict(float)
        for day, _, _, session_id, _, _, seconds in self.chunks:
            if start <= day <= end:
                totals[session_id] += seconds
        return totals

    def sessions_between(self, start, end):
        ids = self.session_totals(start, end)
        return [session for session in self.sessions if session.id in ids]

    def subject_breakdown(self, start, end, comparison_start=None, comparison_end=None):
        selected = defaultdict(float)
        weekly = defaultdict(float)
        monthly = defaultdict(float)
        previous = defaultdict(float)
        by_day = defaultdict(lambda: defaultdict(float))
        topics = defaultdict(lambda: defaultdict(float))
        names = {}
        for day, _, _, session_id, subject_id, topic_id, seconds in self.chunks:
            if start <= day <= end:
                selected[subject_id] += seconds
                by_day[subject_id][day] += seconds
                if topic_id:
                    topics[subject_id][topic_id] += seconds
                    topic = self.session_by_id[session_id].topic
                    names[topic_id] = topic.name
            if self.week_start <= day <= self.today:
                weekly[subject_id] += seconds
            if self.month_start <= day <= self.today:
                monthly[subject_id] += seconds
            if comparison_start is not None and comparison_start <= day <= comparison_end:
                previous[subject_id] += seconds
        total = sum(selected.values())
        # Include current subjects at zero so subject goal progress remains visible.
        items = []
        for subject_id, subject in self.subjects.items():
            if subject.archived and not selected[subject_id]:
                continue
            target = self.goal_for(self.week_start, 'weekly', subject_id)
            daily_trend = [{'date': day.isoformat(), 'seconds': round(by_day[subject_id].get(day, 0))}
                           for day in dates_between(start, end)]
            weekly_trend = defaultdict(float)
            for row in daily_trend:
                weekly_trend[week_start_for(date.fromisoformat(row['date']), self.preferences.week_start)] += row['seconds']
            item = {
                'id': subject_id, 'name': subject.name, 'color': subject.color,
                'seconds': round(selected[subject_id]), 'percent': percentage(selected[subject_id], total),
                'weekly_seconds': round(weekly[subject_id]), 'monthly_seconds': round(monthly[subject_id]),
                'weekly_goal_minutes': target,
                'weekly_goal_percent': percentage(weekly[subject_id], target * 60),
                'daily': daily_trend,
                'weekly': [{'date': day.isoformat(), 'seconds': round(seconds)} for day, seconds in sorted(weekly_trend.items())],
                'topics': [
                    {'id': topic_id, 'name': names[topic_id], 'seconds': round(seconds)}
                    for topic_id, seconds in sorted(topics[subject_id].items(), key=lambda item: (-item[1], item[0]))
                ],
            }
            if comparison_start is not None:
                item['previous_seconds'] = round(previous[subject_id])
                item['change_percent'] = change_percentage(selected[subject_id], previous[subject_id])
            items.append(item)
        return sorted(items, key=lambda item: (-item['seconds'], item['name'].casefold(), item['id']))

    def streaks(self):
        active = {day for day, seconds in self.day_seconds.items() if seconds > 0 and day <= self.today}
        if not active:
            return 0, 0
        first = min(active)
        count = longest = 0
        # Today remains an opportunity to study until the day is complete.
        cutoff = self.today if self.today in active else self.today - timedelta(days=1)
        current = 0
        for day in dates_between(first, self.today):
            if day in active:
                count += 1
                longest = max(longest, count)
            elif day.weekday() not in self.rest_days:
                count = 0
            if day == cutoff:
                current = count
        return current, longest

    def productive_stats(self, start, end):
        selected = {day: seconds for day, seconds in self.day_seconds.items() if start <= day <= end and seconds > 0}
        if not selected:
            return None, None, None
        best_day = min(selected, key=lambda day: (-selected[day], day))
        weekday_seconds = defaultdict(float)
        for day, seconds in selected.items():
            weekday_seconds[day.weekday()] += seconds
        best_weekday = min(weekday_seconds, key=lambda weekday: (-weekday_seconds[weekday], weekday))
        windows = defaultdict(float)
        for day, chunk_start, end_at, _, _, _, _ in self.chunks:
            if not start <= day <= end:
                continue
            cursor = chunk_start
            while cursor < end_at:
                local = cursor.astimezone(self.tz)
                hour = local.hour // 3 * 3
                next_hour = hour + 3
                boundary_day = local.date()
                if next_hour == 24:
                    next_hour = 0
                    boundary_day += timedelta(days=1)
                boundary = datetime.combine(boundary_day, time(next_hour), tzinfo=self.tz).astimezone(UTC)
                stop = min(end_at, boundary)
                if stop <= cursor:
                    stop = min(end_at, cursor + timedelta(hours=1))
                windows[hour] += (stop - cursor).total_seconds()
                cursor = stop
        window = min(windows, key=lambda hour: (-windows[hour], hour))
        return (
            {'date': best_day.isoformat(), 'seconds': round(selected[best_day])},
            {'weekday': best_weekday, 'name': WEEKDAYS[best_weekday], 'seconds': round(weekday_seconds[best_weekday])},
            {'label': f'{window:02d}:00–{window + 3:02d}:00', 'start_hour': window,
             'end_hour': window + 3, 'seconds': round(windows[window])},
        )

    def summary(self, start, end):
        daily = self.daily(start, end)
        totals = self.session_totals(start, end)
        total = sum(totals.values())
        current_streak, longest_streak = self.streaks()
        previous_week_start = self.week_start - timedelta(days=7)
        previous_month_end = self.month_start - timedelta(days=1)
        previous_month_start = previous_month_end.replace(day=1)
        today_seconds = self.seconds_between(self.today, self.today)
        week_seconds = self.seconds_between(self.week_start, self.today)
        month_seconds = self.seconds_between(self.month_start, self.today)
        previous_week_seconds = self.seconds_between(previous_week_start, self.week_start - timedelta(days=1))
        previous_month_seconds = self.seconds_between(previous_month_start, previous_month_end)
        eligible_days = [day for day in daily if not day['is_rest_day'] and day['goal_minutes'] > 0 and day['date'] <= self.today.isoformat()]
        best_day, best_weekday, best_window = self.productive_stats(start, end)
        weeks = defaultdict(float)
        for row in daily:
            weeks[week_start_for(date.fromisoformat(row['date']), self.preferences.week_start)] += row['seconds']
        daily_goal = self.goal_for(self.today)
        weekly_goal = self.goal_for(self.week_start, 'weekly')
        return {
            'from': start.isoformat(), 'to': end.isoformat(), 'timezone': str(self.tz),
            'today_seconds': today_seconds,
            'yesterday_seconds': self.seconds_between(self.today - timedelta(days=1), self.today - timedelta(days=1)),
            'week_seconds': week_seconds, 'month_seconds': month_seconds,
            'year_seconds': self.seconds_between(self.today.replace(month=1, day=1), self.today),
            'all_time_seconds': round(sum(self.day_seconds.values())), 'range_seconds': round(total),
            'total_sessions': len(totals),
            'average_session_seconds': round(total / len(totals)) if totals else 0,
            'average_daily_seconds': round(total / len(daily)) if daily else 0,
            'longest_session_seconds': round(max(totals.values(), default=0)),
            'current_streak': current_streak, 'longest_streak': longest_streak,
            'active_days': sum(row['seconds'] > 0 for row in daily),
            'month_active_days': sum(seconds > 0 for day, seconds in self.day_seconds.items() if self.month_start <= day <= self.today),
            'goal_achievement_rate': percentage(sum(row['goal_achieved'] for row in eligible_days), len(eligible_days)),
            'daily_goal_minutes': daily_goal, 'weekly_goal_minutes': weekly_goal,
            'week_goal_percent': percentage(week_seconds, weekly_goal * 60),
            'today_goal_percent': percentage(today_seconds, daily_goal * 60),
            'previous_week_seconds': previous_week_seconds, 'previous_month_seconds': previous_month_seconds,
            'week_change_percent': change_percentage(week_seconds, previous_week_seconds),
            'month_change_percent': change_percentage(month_seconds, previous_month_seconds),
            'week_difference_seconds': week_seconds - previous_week_seconds,
            'month_difference_seconds': month_seconds - previous_month_seconds,
            'week_in_progress': True, 'month_in_progress': True,
            'most_productive_day': best_day, 'most_productive_weekday': best_weekday,
            'common_study_window': best_window,
            'daily': daily, 'subjects': self.subject_breakdown(start, end),
            'weekly': [{'date': day.isoformat(), 'seconds': round(seconds)} for day, seconds in sorted(weeks.items())],
        }

    def review(self, start):
        start = week_start_for(start, self.preferences.week_start)
        end = start + timedelta(days=6)
        if end >= self.today:
            raise ValueError('Weekly reviews are available after the entire week is complete.')
        previous_start = start - timedelta(days=7)
        previous_end = start - timedelta(days=1)
        daily = self.daily(start, end)
        totals = self.session_totals(start, end)
        total = round(sum(totals.values()))
        previous = self.seconds_between(previous_start, previous_end)
        active_days = sum(day['seconds'] > 0 for day in daily)
        achieved = sum(day['goal_achieved'] for day in daily)
        target = self.goal_for(start, 'weekly')
        subjects = self.subject_breakdown(start, end, previous_start, previous_end)
        for item in subjects:
            subject_target = self.goal_for(start, 'weekly', item['id'])
            item['weekly_seconds'] = item['seconds']
            item['weekly_goal_minutes'] = subject_target
            item['weekly_goal_percent'] = percentage(item['seconds'], subject_target * 60)
        best_day, _, best_window = self.productive_stats(start, end)
        insights = []
        if total:
            insights.append(f'You studied on {active_days} {"day" if active_days == 1 else "days"} this week.')
            insights.append(f'{WEEKDAYS[date.fromisoformat(best_day["date"]).weekday()]} was your most productive day, with {round(best_day["seconds"] / 60)} minutes of focus.')
            if subjects and subjects[0]['seconds']:
                insights.append(f'{subjects[0]["name"]} accounted for {subjects[0]["percent"]:g}% of your study time.')
            if best_window:
                insights.append(f'Your busiest study window was {best_window["label"]} ({self.preferences.timezone}).')
            if achieved:
                insights.append(f'You reached your daily goal on {achieved} {"day" if achieved == 1 else "days"}.')
            if previous:
                difference = round((total - previous) / 60)
                if difference:
                    insights.append(f'You studied {abs(difference)} minutes {"more" if difference > 0 else "less"} than the previous week.')
                else:
                    insights.append('Your study time matched the previous week to the nearest minute.')
        else:
            insights.append('No completed study sessions were recorded this week.')
        return {
            'week_start': start.isoformat(), 'week_end': end.isoformat(), 'is_complete': True,
            'timezone': str(self.tz), 'total_seconds': total, 'previous_seconds': previous,
            'difference_seconds': total - previous, 'change_percent': change_percentage(total, previous),
            'session_count': len(totals),
            'average_active_day_seconds': round(total / active_days) if active_days else 0,
            'active_days': active_days, 'daily_goals_achieved': achieved,
            'weekly_goal_minutes': target, 'weekly_goal_percent': percentage(total, target * 60),
            'longest_session_seconds': round(max(totals.values(), default=0)),
            'most_productive_day': best_day, 'common_study_window': best_window,
            'subjects': subjects, 'daily': daily, 'insights': insights,
        }

    def reviews(self):
        if not self.day_seconds:
            return []
        first = week_start_for(min(self.day_seconds), self.preferences.week_start)
        cursor = self.week_start - timedelta(days=7)
        result = []
        while cursor >= first:
            result.append(self.review(cursor))
            cursor -= timedelta(days=7)
        return result
