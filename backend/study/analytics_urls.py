from django.urls import path

from .analytics_views import AnalyticsView, CalendarView, WeeklyReviewView


urlpatterns = [
    path('analytics/', AnalyticsView.as_view(), name='analytics'),
    path('calendar/', CalendarView.as_view(), name='calendar'),
    path('reviews/', WeeklyReviewView.as_view(), name='reviews'),
]
