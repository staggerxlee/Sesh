import re
from datetime import date, timedelta

from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .analytics import AnalyticsService
from .serializers import StudySessionSerializer


MAX_RANGE_DAYS = 400


def parse_date(value, field):
    try:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
            raise ValueError
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError({field: 'Use a valid date in YYYY-MM-DD format.'})


def parse_range(request, today):
    end = parse_date(request.query_params['to'], 'to') if 'to' in request.query_params else today
    if 'from' in request.query_params:
        start = parse_date(request.query_params['from'], 'from')
    else:
        try:
            start = end - timedelta(days=29)
        except OverflowError:
            start = date.min
    if end < start:
        raise ValidationError({'to': 'The end date must be on or after the start date.'})
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ValidationError({'to': f'Choose a date range of {MAX_RANGE_DAYS} days or fewer.'})
    return start, end


class AnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        service = AnalyticsService(request.user)
        start, end = parse_range(request, service.today)
        result = service.summary(start, end)
        result['recent_sessions'] = StudySessionSerializer(
            service.sessions_between(start, end)[:8], many=True, context={'request': request},
        ).data
        return Response(result)


class CalendarView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        service = AnalyticsService(request.user)
        start, end = parse_range(request, service.today)
        return Response({
            'from': start.isoformat(), 'to': end.isoformat(), 'timezone': str(service.tz),
            'days': service.daily(start, end),
            'sessions': StudySessionSerializer(
                service.sessions_between(start, end), many=True, context={'request': request},
            ).data,
        })


class WeeklyReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        service = AnalyticsService(request.user)
        if 'week' in request.query_params:
            selected = parse_date(request.query_params['week'], 'week')
            try:
                return Response(service.review(selected))
            except (ValueError, OverflowError) as error:
                raise ValidationError({'week': str(error)})
        return Response(service.reviews())
