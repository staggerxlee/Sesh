"""Private calendar reflections use compare-and-swap revisions, including deletions."""
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import CalendarNote


class NoteInput(serializers.Serializer):
    kind = serializers.ChoiceField(choices=['daily', 'monthly', 'motto'])
    date = serializers.DateField()
    revision = serializers.IntegerField(min_value=0, required=False)
    text = serializers.CharField(max_length=5000, allow_blank=True, trim_whitespace=False, required=False)
    cover = serializers.ChoiceField(choices=['', 'lily'], required=False)

    def validate(self, attrs):
        if attrs['kind'] == 'monthly' and attrs['date'].day != 1:
            raise serializers.ValidationError('Monthly notes use the first day of the month.')
        if attrs['kind'] == 'motto' and attrs['date'].isoformat() != '2000-01-01':
            raise serializers.ValidationError('The personal motto uses a single permanent key.')
        if attrs['kind'] == 'motto' and len(attrs.get('text', '')) > 240:
            raise serializers.ValidationError('Keep your motto within 240 characters.')
        return attrs


def note_data(note):
    return {'text': note.text, 'cover': note.cover, 'revision': note.revision, 'updated_at': note.updated_at}


class CalendarNoteView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = NoteInput(data=request.query_params)
        query.is_valid(raise_exception=True)
        values = query.validated_data
        note = CalendarNote.objects.filter(user=request.user, kind=values['kind'], date=values['date']).first()
        return Response(note_data(note) if note else {'text': '', 'cover': '', 'revision': 0, 'updated_at': None})

    def patch(self, request):
        incoming = NoteInput(data=request.data)
        incoming.is_valid(raise_exception=True)
        values = incoming.validated_data
        if 'revision' not in values or 'text' not in values:
            raise serializers.ValidationError('Text and the last-read revision are required.')
        with transaction.atomic():
            note, _ = CalendarNote.objects.get_or_create(user=request.user, kind=values['kind'], date=values['date'])
            changes = {'text': values['text'], 'revision': F('revision') + 1, 'updated_at': timezone.now()}
            if 'cover' in values:
                changes['cover'] = values['cover']
            updated = CalendarNote.objects.filter(pk=note.pk, revision=values['revision']).update(**changes)
            note.refresh_from_db()
            if not updated:
                return Response({'detail': 'This note changed on another device. Review the saved version before saving again.', 'current': note_data(note)}, status=409)
        return Response(note_data(note))
