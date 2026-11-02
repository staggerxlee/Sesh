from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models
from django.db.models import Q, F
from django.utils import timezone


class UserPreferences(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='preferences')
    timezone = models.CharField(max_length=64, default='Asia/Kathmandu')
    week_start = models.PositiveSmallIntegerField(default=0, choices=[(0, 'Monday'), (6, 'Sunday')])
    daily_goal_minutes = models.PositiveIntegerField(default=120, validators=[MaxValueValidator(1440)])
    weekly_goal_minutes = models.PositiveIntegerField(default=600, validators=[MaxValueValidator(10080)])
    default_mode = models.CharField(max_length=12, default='stopwatch', choices=[(m, m) for m in ['stopwatch', 'countdown', 'pomodoro']])
    default_duration = models.PositiveIntegerField(default=25, validators=[MinValueValidator(1), MaxValueValidator(1440)])
    pomodoro_focus = models.PositiveIntegerField(default=25, validators=[MinValueValidator(1), MaxValueValidator(180)])
    short_break = models.PositiveIntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(60)])
    long_break = models.PositiveIntegerField(default=15, validators=[MinValueValidator(1), MaxValueValidator(120)])
    theme = models.CharField(max_length=10, default='system', choices=[(m, m) for m in ['system', 'light', 'dark']])
    reduced_motion = models.BooleanField(default=False)
    notifications = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=False)


class Subject(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='subjects')
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default='#7B8C72', validators=[RegexValidator(r'^#[0-9a-fA-F]{6}$', 'Use a six-digit hex color.')])
    icon = models.CharField(max_length=40, blank=True)
    weekly_goal_minutes = models.PositiveIntegerField(default=0, validators=[MaxValueValidator(10080)])
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [models.Index(fields=['user', 'archived'])]


class Topic(models.Model):
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='topics')
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ['name', 'id']
        constraints = [models.UniqueConstraint(fields=['subject', 'name'], name='unique_topic_name_per_subject')]


class StudySession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='study_sessions')
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name='sessions')
    topic = models.ForeignKey(Topic, on_delete=models.PROTECT, blank=True, null=True, related_name='sessions')
    mode = models.CharField(max_length=12, choices=[(m, m) for m in ['stopwatch', 'countdown', 'pomodoro', 'manual']])
    status = models.CharField(max_length=12, default='active', choices=[(s, s) for s in ['active', 'paused', 'completed', 'discarded']])
    phase = models.CharField(max_length=5, default='focus', choices=[('focus', 'focus'), ('break', 'break')])
    started_at = models.DateTimeField(default=timezone.now)
    phase_started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    target_seconds = models.PositiveIntegerField(default=1500)
    break_seconds = models.PositiveIntegerField(default=300)
    long_break_seconds = models.PositiveIntegerField(default=900)
    completed_focus_cycles = models.PositiveIntegerField(default=0)
    note = models.TextField(blank=True, max_length=5000)
    source = models.CharField(max_length=6, default='timer', choices=[('timer', 'timer'), ('manual', 'manual')])
    last_heartbeat_at = models.DateTimeField(default=timezone.now)
    revision = models.PositiveIntegerField(default=0)
    edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-started_at', '-id']
        constraints = [
            models.UniqueConstraint(fields=['user'], condition=Q(status__in=['active', 'paused']), name='one_live_session_per_user'),
            models.CheckConstraint(condition=Q(ended_at__isnull=True) | Q(ended_at__gte=F('started_at')), name='session_end_after_start'),
        ]
        indexes = [models.Index(fields=['user', 'status', 'started_at']), models.Index(fields=['user', 'subject', 'started_at'])]


class StudyInterval(models.Model):
    session = models.ForeignKey(StudySession, on_delete=models.CASCADE, related_name='intervals')
    kind = models.CharField(max_length=5, choices=[('focus', 'focus'), ('break', 'break')])
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['started_at', 'id']
        constraints = [
            models.UniqueConstraint(fields=['session'], condition=Q(ended_at__isnull=True), name='one_open_interval_per_session'),
            models.CheckConstraint(condition=Q(ended_at__isnull=True) | Q(ended_at__gte=F('started_at')), name='interval_end_after_start'),
        ]


class StudyGoal(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='goals')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, null=True, blank=True, related_name='goals')
    kind = models.CharField(max_length=6, choices=[('daily', 'daily'), ('weekly', 'weekly')])
    target_minutes = models.PositiveIntegerField(validators=[MaxValueValidator(10080)])
    effective_from = models.DateField()

    class Meta:
        ordering = ['effective_from', 'id']
        constraints = [
            models.UniqueConstraint(fields=['user', 'kind', 'subject'], condition=Q(subject__isnull=False), name='one_current_subject_goal'),
            models.UniqueConstraint(fields=['user', 'kind'], condition=Q(subject__isnull=True), name='one_current_general_goal'),
        ]


class GoalHistory(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='goal_history')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, null=True, blank=True, related_name='goal_history')
    kind = models.CharField(max_length=6, choices=[('daily', 'daily'), ('weekly', 'weekly')])
    target_minutes = models.PositiveIntegerField()
    effective_from = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['effective_from', 'id']
        indexes = [models.Index(fields=['user', 'kind', 'effective_from'])]
        constraints = [
            models.UniqueConstraint(fields=['user', 'kind', 'subject', 'effective_from'], condition=Q(subject__isnull=False), name='unique_subject_goal_history_date'),
            models.UniqueConstraint(fields=['user', 'kind', 'effective_from'], condition=Q(subject__isnull=True), name='unique_general_goal_history_date'),
        ]


class RestDayPreferences(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='rest_days')
    weekday = models.PositiveSmallIntegerField(validators=[MaxValueValidator(6)])

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'weekday'], name='unique_rest_day')]


class WeeklyReview(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='weekly_reviews')
    week_start = models.DateField()
    generated_at = models.DateTimeField(auto_now=True)
    snapshot = models.JSONField(default=dict)

    class Meta:
        ordering = ['-week_start']
        constraints = [models.UniqueConstraint(fields=['user', 'week_start'], name='unique_weekly_review')]


class SessionEvent(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    client_event_id = models.CharField(max_length=100)
    action = models.CharField(max_length=32)
    session = models.ForeignKey(StudySession, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'client_event_id'], name='unique_client_session_event')]


class PersonalCover(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    words = models.CharField(max_length=240, blank=True)
    show_on_entry = models.BooleanField(default=False)
    focal_x = models.PositiveSmallIntegerField(default=50)
    focal_y = models.PositiveSmallIntegerField(default=50)
    image_revision = models.UUIDField(null=True)
    # Store only bounded, re-encoded derivatives. No media path or public URL.
    wide = models.BinaryField(null=True)
    small = models.BinaryField(null=True)
