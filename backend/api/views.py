from django.db import connection
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Comprueba que el backend responde y que la base de datos está disponible.

    Se usará también como health check de Docker.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Estado del servicio",
        responses={200: OpenApiResponse(description="Servicio y base de datos operativos"),
                   503: OpenApiResponse(description="Base de datos no disponible")},
    )
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:
            return Response(
                {"status": "error", "database": "unavailable"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({"status": "ok", "database": "ok"})
