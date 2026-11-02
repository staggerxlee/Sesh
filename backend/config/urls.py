from django.http import JsonResponse
from django.urls import include, path

urlpatterns = [
    path('health/', lambda request: JsonResponse({'status': 'ok', 'service': 'sesh'})),
    path('api/v1/', include('study.urls')),
    path('api/v1/', include('study.analytics_urls')),
]
