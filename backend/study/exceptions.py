from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler

class Conflict(APIException):
    status_code = 409
    default_detail = 'The session changed. Refresh its state and try again.'
    default_code = 'conflict'

def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is not None and response.status_code == 403 and getattr(exc, 'default_code', '') == 'not_authenticated':
        response.status_code = 401
    return response
