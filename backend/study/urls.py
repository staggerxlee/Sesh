from django.urls import path
from . import views, personal

urlpatterns = [
    path('profile/cover/', personal.edit_cover),
    path('profile/cover/image/<str:size>/', personal.cover_image),
    path('auth/csrf/', views.csrf_view),
    path('auth/me/', views.me_view),
    path('auth/register/', views.register_view),
    path('auth/login/', views.login_view),
    path('auth/logout/', views.logout_view),
    path('auth/password-reset/', views.password_reset_view),
    path('auth/reset-confirm/', views.reset_confirm_view),
    path('auth/verify-email/', views.verify_email_view),
    path('auth/resend-verification/', views.resend_verification_view),
    path('auth/account/', views.account_view),
    path('preferences/', views.PreferencesView.as_view()),
    path('subjects/', views.SubjectsView.as_view()),
    path('subjects/<int:pk>/', views.SubjectDetailView.as_view()),
    path('topics/', views.TopicsView.as_view()),
    path('topics/<int:pk>/', views.TopicDetailView.as_view()),
    path('sessions/', views.SessionsView.as_view()),
    path('sessions/active/', views.ActiveSessionView.as_view()),
    path('sessions/start/', views.StartSessionView.as_view()),
    path('sessions/<int:pk>/', views.SessionDetailView.as_view()),
    path('sessions/<int:pk>/<str:action>/', views.SessionActionView.as_view()),
    path('goals/', views.GoalsView.as_view()),
    path('export/', views.export_view),
]
