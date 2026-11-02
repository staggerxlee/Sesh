import logging
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from django.views.decorators.cache import never_cache
from .personal import user_cover
from .exceptions import Conflict
from .models import GoalHistory, RestDayPreferences, StudyGoal, StudySession, Subject, Topic, WeeklyReview
from .serializers import (GoalSerializer, ManualSessionSerializer, PreferencesSerializer,
                          StartSessionSerializer, StudySessionSerializer, SubjectSerializer, TopicSerializer)
from .services import goal_effective_date, preferences_for, session_action, set_goal, start_session

logger = logging.getLogger(__name__)
User = get_user_model()


class AuthThrottle(SimpleRateThrottle):
    scope = 'auth'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


def account_payload(user):
    prefs = preferences_for(user)
    return {'user': {'id': user.id, 'email': user.email, 'first_name': user.first_name,
                     'email_verified': prefs.email_verified, 'cover': user_cover(user)}, 'preferences': PreferencesSerializer(prefs).data}


def send_verification(user):
    token = signing.dumps({'uid': user.pk, 'email': user.email}, salt='sesh.verify-email')
    url = f'{settings.FRONTEND_URL}/verify-email?token={token}'
    send_mail('Verify your Sesh email', f'Welcome to Sesh. Verify your email using this link:\n\n{url}\n\nThis link expires in 3 days.',
              settings.DEFAULT_FROM_EMAIL, [user.email])


def password_errors(password, user):
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        raise ValidationError({'password': error.messages})


@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def csrf_view(request):
    return Response({'csrfToken': get_token(request)})


@never_cache
@api_view(['GET'])
def me_view(request):
    return Response(account_payload(request.user))


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
@csrf_protect
def register_view(request):
    email_field = serializers.EmailField(max_length=150)
    email = email_field.run_validation(request.data.get('email', '')).strip().lower()
    name = serializers.CharField(max_length=150, allow_blank=True).run_validation(request.data.get('first_name', ''))
    password = serializers.CharField(min_length=10, max_length=256).run_validation(request.data.get('password', ''))
    user = User(username=email, email=email, first_name=name)
    password_errors(password, user)
    if User.objects.filter(email__iexact=email).exists():
        raise ValidationError({'email': 'An account already exists with this email.'})
    try:
        with transaction.atomic():
            user.set_password(password)
            user.save()
            prefs = preferences_for(user)
            if 'timezone' in request.data:
                settings_serializer = PreferencesSerializer(prefs, data={'timezone': request.data['timezone']}, partial=True)
                settings_serializer.is_valid(raise_exception=True)
                settings_serializer.save()
    except IntegrityError:
        raise ValidationError({'email': 'An account already exists with this email.'})
    login(request, user)
    delivered = True
    try:
        send_verification(user)
    except Exception:
        delivered = False
        logger.exception('Email verification delivery failed for account %s', user.pk)
    return Response({**account_payload(user), 'verification_sent': delivered, 'csrfToken': get_token(request)}, status=201)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
@csrf_protect
def login_view(request):
    email = str(request.data.get('email', '')).strip().lower()
    password = request.data.get('password', '')
    if not isinstance(password, str):
        raise ValidationError({'password': 'Enter your password.'})
    user = authenticate(request, username=email, password=password)
    if not user:
        return Response({'detail': 'The email or password is incorrect.'}, status=401)
    login(request, user)
    return Response({**account_payload(user), 'csrfToken': get_token(request)})


@api_view(['POST'])
def logout_view(request):
    logout(request)
    return Response({'detail': 'Signed out.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
@csrf_protect
def password_reset_view(request):
    email = serializers.EmailField().run_validation(request.data.get('email', '')).strip().lower()
    user = User.objects.filter(email__iexact=email, is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f'{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}'
        try:
            send_mail('Reset your Sesh password', f'Choose a new password here:\n\n{link}\n\nThis link expires in one hour. If you did not request it, ignore this email.',
                      settings.DEFAULT_FROM_EMAIL, [user.email])
        except Exception:
            logger.exception('Password reset email delivery failed')
    return Response({'detail': 'If that email has an account, a password reset link has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
@csrf_protect
def reset_confirm_view(request):
    try:
        user_id = force_str(urlsafe_base64_decode(request.data.get('uid', '')))
        user = User.objects.get(pk=user_id, is_active=True)
    except (ValueError, TypeError, OverflowError, User.DoesNotExist):
        raise ValidationError({'detail': 'This reset link is invalid or expired.'})
    token = serializers.CharField(max_length=256).run_validation(request.data.get('token', ''))
    if not default_token_generator.check_token(user, token):
        raise ValidationError({'detail': 'This reset link is invalid or expired.'})
    password = serializers.CharField(min_length=10, max_length=256).run_validation(request.data.get('password', ''))
    password_errors(password, user)
    user.set_password(password)
    user.save(update_fields=['password'])
    return Response({'detail': 'Password updated. You can now sign in.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthThrottle])
@csrf_protect
def verify_email_view(request):
    token = serializers.CharField(max_length=1024).run_validation(request.data.get('token', ''))
    try:
        payload = signing.loads(token, salt='sesh.verify-email', max_age=60 * 60 * 24 * 3)
        user = User.objects.get(pk=payload['uid'], email=payload['email'])
    except (signing.BadSignature, User.DoesNotExist, KeyError, TypeError):
        raise ValidationError({'detail': 'This verification link is invalid or expired.'})
    prefs = preferences_for(user)
    prefs.email_verified = True
    prefs.save(update_fields=['email_verified'])
    return Response({'detail': 'Your email is verified.'})


@api_view(['POST'])
@throttle_classes([AuthThrottle])
def resend_verification_view(request):
    if preferences_for(request.user).email_verified:
        return Response({'detail': 'Your email is already verified.'})
    try:
        send_verification(request.user)
    except Exception:
        logger.exception('Verification email delivery failed')
        return Response({'detail': 'Email could not be sent right now. Please try again later.'}, status=503)
    return Response({'detail': 'A new verification link has been sent.'})


@api_view(['DELETE'])
def account_view(request):
    password = request.data.get('password', '')
    if not isinstance(password, str) or not request.user.check_password(password):
        raise ValidationError({'password': 'Enter your current password to delete your account.'})
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=request.user.pk)
        # PROTECT preserves histories during ordinary subject operations; explicit
        # account deletion intentionally removes all owned histories first.
        user.study_sessions.all().delete()
        user.delete()
    logout(request)
    return Response(status=204)


class PreferencesView(APIView):
    def get(self, request):
        return Response(PreferencesSerializer(preferences_for(request.user)).data)

    def patch(self, request):
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            serializer = PreferencesSerializer(preferences_for(request.user), data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
        return Response(serializer.data)


class SubjectsView(APIView):
    def get(self, request):
        return Response(SubjectSerializer(request.user.subjects.prefetch_related('topics'), many=True).data)

    def post(self, request):
        serializer = SubjectSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=201)


class SubjectDetailView(APIView):
    def patch(self, request, pk):
        subject = get_object_or_404(Subject, pk=pk, user=request.user)
        serializer = SubjectSerializer(subject, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        subject = get_object_or_404(Subject, pk=pk, user=request.user)
        if request.data.get('confirm') is not True:
            raise ValidationError({'confirm': 'Confirm subject deletion.'})
        try:
            subject.delete()
        except ProtectedError:
            raise Conflict('This subject has study history. Archive it to preserve your records.')
        return Response(status=204)


class TopicsView(APIView):
    def get(self, request):
        topics = Topic.objects.filter(subject__user=request.user)
        if request.query_params.get('subject'):
            try:
                subject_id = int(request.query_params['subject'])
            except (TypeError, ValueError):
                raise ValidationError({'subject': 'Use a numeric identifier.'})
            subject = get_object_or_404(Subject, user=request.user, pk=subject_id)
            topics = topics.filter(subject=subject)
        return Response(TopicSerializer(topics, many=True).data)

    def post(self, request):
        serializer = TopicSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)


class TopicDetailView(APIView):
    def patch(self, request, pk):
        topic = get_object_or_404(Topic, pk=pk, subject__user=request.user)
        serializer = TopicSerializer(topic, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        topic = get_object_or_404(Topic, pk=pk, subject__user=request.user)
        try:
            topic.delete()
        except ProtectedError:
            raise Conflict('This topic has study history and cannot be deleted.')
        return Response(status=204)


def session_queryset(user):
    return StudySession.objects.filter(user=user).select_related('subject', 'topic').prefetch_related('intervals')


class SessionsView(APIView):
    def get(self, request):
        sessions = session_queryset(request.user).filter(status='completed')
        for field in ['subject', 'topic']:
            value = request.query_params.get(field)
            if value:
                try:
                    sessions = sessions.filter(**{f'{field}_id': int(value)})
                except ValueError:
                    raise ValidationError({field: 'Use a numeric identifier.'})
        tz = ZoneInfo(preferences_for(request.user).timezone)
        for key, operator in [('from', 'gte'), ('to', 'lt')]:
            value = request.query_params.get(key)
            if value:
                try:
                    day = date.fromisoformat(value)
                except ValueError:
                    raise ValidationError({key: 'Use YYYY-MM-DD.'})
                if key == 'to':
                    day += timedelta(days=1)
                boundary = datetime.combine(day, time.min, tzinfo=tz)
                sessions = sessions.filter(**{f'started_at__{operator}': boundary})
        return Response(StudySessionSerializer(sessions, many=True).data)

    def post(self, request):
        serializer = ManualSessionSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        session = serializer.save(user=request.user)
        return Response(StudySessionSerializer(session).data, status=201)


class SessionDetailView(APIView):
    def get(self, request, pk):
        return Response(StudySessionSerializer(get_object_or_404(session_queryset(request.user), pk=pk)).data)

    def patch(self, request, pk):
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            session = get_object_or_404(session_queryset(request.user), pk=pk)
            if session.status != 'completed':
                raise Conflict('Only completed sessions can be edited.')
            serializer = ManualSessionSerializer(session, data=request.data, partial=True, context={'request': request})
            serializer.is_valid(raise_exception=True)
            session = serializer.save()
        return Response(StudySessionSerializer(session).data)

    def delete(self, request, pk):
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            session = get_object_or_404(StudySession, user=request.user, pk=pk)
            if session.status != 'completed':
                raise Conflict('Only completed sessions can be deleted. Discard a running session instead.')
            session.delete()
        return Response(status=204)


class ActiveSessionView(APIView):
    def get(self, request):
        session = session_queryset(request.user).filter(status__in=['active', 'paused']).first()
        return Response(StudySessionSerializer(session).data if session else None)


class StartSessionView(APIView):
    def post(self, request):
        serializer = StartSessionSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        session = start_session(request.user, serializer.validated_data, request.data)
        return Response(StudySessionSerializer(session).data, status=201)


class SessionActionView(APIView):
    def post(self, request, pk, action):
        session = session_action(request.user, pk, action, request.data)
        return Response(StudySessionSerializer(session).data)


class GoalsView(APIView):
    def get(self, request):
        preferences_for(request.user)
        return Response(GoalSerializer(request.user.goals.all(), many=True).data)

    def post(self, request):
        serializer = GoalSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            prefs = preferences_for(request.user)
            subject = data.get('subject')
            kind, target = data['kind'], data['target_minutes']
            set_goal(request.user, kind, target, goal_effective_date(prefs, kind), subject)
            if subject:
                subject.weekly_goal_minutes = target
                subject.save(update_fields=['weekly_goal_minutes'])
            else:
                setattr(prefs, f'{kind}_goal_minutes', target)
                prefs.save(update_fields=[f'{kind}_goal_minutes'])
            goal = request.user.goals.get(subject=subject, kind=kind)
        return Response(GoalSerializer(goal).data, status=201)


@api_view(['GET'])
def export_view(request):
    data = {
        'schema_version': 1, 'exported_at': timezone.now().isoformat(),
        **account_payload(request.user),
        'subjects': SubjectSerializer(request.user.subjects.prefetch_related('topics'), many=True).data,
        'sessions': StudySessionSerializer(session_queryset(request.user), many=True).data,
        'intervals': list(request.user.study_sessions.values('id', 'intervals__id', 'intervals__kind', 'intervals__started_at', 'intervals__ended_at')),
        'goals': GoalSerializer(request.user.goals.all(), many=True).data,
        'goal_history': list(request.user.goal_history.values('subject_id', 'kind', 'target_minutes', 'effective_from')),
    }
    response = Response(data)
    response['Content-Disposition'] = 'attachment; filename="sesh-export.json"'
    return response
