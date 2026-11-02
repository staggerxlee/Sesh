from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import RestDayPreferences, StudyGoal, StudyInterval, StudySession, Subject, Topic, UserPreferences
from .services import goal_effective_date, preferences_for, session_totals, set_goal, phase_limit


class TopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Topic
        fields = ['id', 'subject', 'name']
        validators = []

    def validate_subject(self, subject):
        if subject.user_id != self.context['request'].user.id:
            raise serializers.ValidationError('Subject not found.')
        return subject

    def validate(self, attrs):
        subject = attrs.get('subject', getattr(self.instance, 'subject', None))
        name = attrs.get('name', getattr(self.instance, 'name', ''))
        if self.instance and subject.pk != self.instance.subject_id and self.instance.sessions.exists():
            raise serializers.ValidationError('A topic with history cannot be moved to another subject.')
        query = Topic.objects.filter(subject=subject, name=name)
        if self.instance:
            query = query.exclude(pk=self.instance.pk)
        if query.exists():
            raise serializers.ValidationError({'name': 'This topic already exists for this subject.'})
        return attrs


class SubjectSerializer(serializers.ModelSerializer):
    topics = TopicSerializer(many=True, read_only=True)
    session_count = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = ['id', 'name', 'color', 'icon', 'weekly_goal_minutes', 'archived', 'created_at', 'topics', 'session_count']
        read_only_fields = ['created_at']

    def get_session_count(self, obj):
        return obj.sessions.filter(status='completed').count()

    def create(self, validated_data):
        with transaction.atomic():
            subject = super().create(validated_data)
            prefs = preferences_for(subject.user)
            set_goal(subject.user, 'weekly', subject.weekly_goal_minutes, goal_effective_date(prefs, 'weekly'), subject)
            return subject

    def update(self, instance, validated_data):
        with transaction.atomic():
            subject = super().update(instance, validated_data)
            if 'weekly_goal_minutes' in validated_data:
                prefs = preferences_for(subject.user)
                set_goal(subject.user, 'weekly', subject.weekly_goal_minutes, goal_effective_date(prefs, 'weekly'), subject)
            return subject


class PreferencesSerializer(serializers.ModelSerializer):
    rest_days = serializers.ListField(child=serializers.IntegerField(min_value=0, max_value=6), required=False)

    class Meta:
        model = UserPreferences
        exclude = ['id', 'user', 'email_verified']

    def to_representation(self, instance):
        # ListField is writable; attach its output separately from model fields.
        instance.rest_days = list(instance.user.rest_days.order_by('weekday').values_list('weekday', flat=True))
        return super().to_representation(instance)

    def validate_daily_goal_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError('Choose at least one minute.')
        return value

    def validate_weekly_goal_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError('Choose at least one minute.')
        return value

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError('Choose a valid IANA timezone, such as Asia/Kathmandu.')
        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        days = validated_data.pop('rest_days', None)
        changed_goals = [(kind, field) for kind, field in [('daily', 'daily_goal_minutes'), ('weekly', 'weekly_goal_minutes')] if field in validated_data and validated_data[field] != getattr(instance, field)]
        instance = super().update(instance, validated_data)
        for kind, field in changed_goals:
            set_goal(instance.user, kind, getattr(instance, field), goal_effective_date(instance, kind))
        if days is not None:
            RestDayPreferences.objects.filter(user=instance.user).delete()
            RestDayPreferences.objects.bulk_create([RestDayPreferences(user=instance.user, weekday=d) for d in sorted(set(days))])
        return instance


class OwnedSessionFields(serializers.Serializer):
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    topic = serializers.PrimaryKeyRelatedField(queryset=Topic.objects.all(), required=False, allow_null=True)

    def validate(self, attrs):
        subject = attrs.get('subject', getattr(self.instance, 'subject', None))
        topic = attrs.get('topic', getattr(self.instance, 'topic', None))
        if not subject or subject.user_id != self.context['request'].user.id:
            raise serializers.ValidationError({'subject': 'Subject not found.'})
        if subject.archived and not self.instance:
            raise serializers.ValidationError({'subject': 'Restore this subject before adding a session.'})
        if topic and topic.subject_id != subject.id:
            raise serializers.ValidationError({'topic': 'Choose a topic belonging to this subject.'})
        return attrs


class StartSessionSerializer(OwnedSessionFields):
    mode = serializers.ChoiceField(choices=['stopwatch', 'countdown', 'pomodoro'])
    target_seconds = serializers.IntegerField(default=1500, min_value=1, max_value=86400)
    break_seconds = serializers.IntegerField(default=300, min_value=1, max_value=7200)


class ManualSessionSerializer(OwnedSessionFields):
    started_at = serializers.DateTimeField()
    duration_seconds = serializers.IntegerField(min_value=1, max_value=86400)
    note = serializers.CharField(max_length=5000, allow_blank=True, required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start = attrs.get('started_at', getattr(self.instance, 'started_at', None))
        duration = attrs.get('duration_seconds')
        if duration is None and self.instance:
            duration = session_totals(self.instance)['elapsed_seconds']
        if start and duration is not None and start + timedelta(seconds=duration) > timezone.now() + timedelta(seconds=5):
            raise serializers.ValidationError({'started_at': 'A completed session cannot end in the future.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        duration = validated_data.pop('duration_seconds')
        user = validated_data.pop('user')
        start = validated_data['started_at']
        end = start + timedelta(seconds=duration)
        session = StudySession.objects.create(user=user, status='completed', mode='manual', source='manual',
            ended_at=end, phase_started_at=start, last_heartbeat_at=end, target_seconds=duration, **validated_data)
        StudyInterval.objects.create(session=session, kind='focus', started_at=start, ended_at=end)
        return session

    @transaction.atomic
    def update(self, instance, validated_data):
        # Preserve original intervals for a notes/subject-only edit. Duration or date
        # edits deliberately replace the time accounting with one explicit interval.
        duration = validated_data.pop('duration_seconds', None)
        if duration is not None or 'started_at' in validated_data:
            duration = duration if duration is not None else session_totals(instance)['elapsed_seconds']
            start = validated_data.get('started_at', instance.started_at)
            instance.intervals.all().delete()
            instance.ended_at = start + timedelta(seconds=duration)
            instance.phase_started_at = start
            instance.phase = 'focus'
            StudyInterval.objects.create(session=instance, kind='focus', started_at=start, ended_at=instance.ended_at)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.edited_at = timezone.now()
        instance.revision += 1
        instance.save()
        instance._prefetched_objects_cache = {}
        return instance


class StudySessionSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_color = serializers.CharField(source='subject.color', read_only=True)
    topic_name = serializers.CharField(source='topic.name', read_only=True, default=None)

    class Meta:
        model = StudySession
        fields = ['id', 'subject', 'subject_name', 'subject_color', 'topic', 'topic_name', 'mode', 'status', 'phase',
                  'started_at', 'phase_started_at', 'ended_at', 'source', 'note', 'target_seconds', 'break_seconds',
                  'last_heartbeat_at', 'revision', 'edited_at', 'completed_focus_cycles', 'long_break_seconds']

    def to_representation(self, instance):
        result = super().to_representation(instance)
        result.update(session_totals(instance))
        if instance.phase == 'break':
            result['break_seconds'] = phase_limit(instance)
        result['server_now'] = timezone.now().isoformat()
        return result


class GoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyGoal
        fields = ['id', 'subject', 'kind', 'target_minutes', 'effective_from']
        read_only_fields = ['id', 'effective_from']
        validators = []

    def validate(self, attrs):
        subject = attrs.get('subject')
        if subject and subject.user_id != self.context['request'].user.id:
            raise serializers.ValidationError({'subject': 'Subject not found.'})
        if subject and attrs['kind'] != 'weekly':
            raise serializers.ValidationError({'kind': 'Subject goals are weekly.'})
        if attrs['kind'] == 'daily' and attrs['target_minutes'] > 1440:
            raise serializers.ValidationError({'target_minutes': 'A daily target cannot exceed 1,440 minutes.'})
        return attrs
