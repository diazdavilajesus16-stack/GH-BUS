from django.conf import settings
from django.db import connection
from django.db.models import Q
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.routes.models import Ciudad
from .assistant import (
    GeminiNotConfigured,
    GeminiProviderError,
    buscar_viajes_disponibles,
    contiene_datos_sensibles,
    generar_respuesta_gemini,
)


class PublicDestinationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ciudad
        fields = ["id", "nombre", "departamento"]


class PublicDestinationsView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Ciudades activas para explorar destinos",
        responses={200: PublicDestinationSerializer(many=True)},
    )
    def get(self, request):
        ciudades = (
            Ciudad.objects.filter(activa=True)
            .filter(Q(rutas_origen__activa=True) | Q(rutas_destino__activa=True))
            .distinct()
            .order_by("nombre", "departamento")
        )
        return Response(PublicDestinationSerializer(ciudades, many=True).data)


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


class AssistantTripSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    codigo = serializers.CharField()
    origen = serializers.CharField()
    destino = serializers.CharField()
    salida = serializers.DateTimeField()
    servicio = serializers.CharField()
    precio = serializers.CharField()
    capacidad = serializers.IntegerField()
    asientos_disponibles = serializers.IntegerField()


class AssistantChatResponseSerializer(serializers.Serializer):
    answer = serializers.CharField()
    trips = AssistantTripSerializer(many=True)
    results_truncated = serializers.BooleanField()
    trips_are_alternatives = serializers.BooleanField()


class AssistantHistoryMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=("user", "assistant"))
    content = serializers.CharField(max_length=1000, allow_blank=False)


class AssistantChatRequestSerializer(serializers.Serializer):
    message = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    origin = serializers.CharField(required=False, allow_blank=True, max_length=80)
    destination = serializers.CharField(required=False, allow_blank=True, max_length=80)
    departure_date = serializers.DateField(required=False)
    history = serializers.ListField(
        child=AssistantHistoryMessageSerializer(),
        required=False,
        max_length=8,
    )

    def validate_message(self, value):
        if contiene_datos_sensibles(value):
            raise serializers.ValidationError(
                "No incluyas teléfonos, documentos, tarjetas, contraseñas ni códigos QR."
            )
        return value

    def validate_history(self, value):
        if any(contiene_datos_sensibles(message["content"]) for message in value):
            raise serializers.ValidationError(
                "El historial contiene datos personales. Elimínalos antes de continuar."
            )
        if any(
            message["role"] != ("user" if index % 2 == 0 else "assistant")
            for index, message in enumerate(value)
        ):
            raise serializers.ValidationError(
                "El historial debe alternar entre mensajes del cliente y del asistente."
            )
        return value

    def validate(self, attrs):
        origin = attrs.get("origin", "").strip()
        destination = attrs.get("destination", "").strip()
        has_route = bool(origin and destination)
        has_partial_route = bool(origin) != bool(destination)
        if has_partial_route or (attrs.get("departure_date") and not has_route):
            raise serializers.ValidationError(
                {"origin": "Para buscar viajes, indica origen y destino; la fecha es opcional."}
            )
        if not attrs.get("message", "").strip() and not has_route:
            raise serializers.ValidationError({"message": "Escribe una pregunta o busca un viaje."})
        return attrs


class AssistantChatView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "assistant"

    @extend_schema(
        summary="Asistente de viajes para clientes",
        request=AssistantChatRequestSerializer,
        responses={200: AssistantChatResponseSerializer},
    )
    def post(self, request):
        serializer = AssistantChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        datos = serializer.validated_data
        tiene_filtros = bool(datos.get("origin") and datos.get("destination"))
        resultados_son_alternativas = False
        viajes, resultados_limitados = ([], False)
        busqueda = {}
        if tiene_filtros:
            busqueda = {
                "origen": datos["origin"].strip(),
                "destino": datos["destination"].strip(),
                "fecha_solicitada": (
                    datos["departure_date"].isoformat()
                    if datos.get("departure_date")
                    else None
                ),
            }
            viajes, resultados_limitados = buscar_viajes_disponibles(
                datos["origin"].strip(),
                datos["destination"].strip(),
                datos.get("departure_date"),
            )
            if datos.get("departure_date") and not viajes:
                viajes, resultados_limitados = buscar_viajes_disponibles(
                    datos["origin"].strip(),
                    datos["destination"].strip(),
                )
                resultados_son_alternativas = bool(viajes)

        pregunta = datos.get("message", "").strip()
        if tiene_filtros and not pregunta:
            ruta = f"{busqueda['origen']} → {busqueda['destino']}"
            fecha = datos.get("departure_date")
            fecha_texto = fecha.strftime("%d/%m/%Y") if fecha else None
            if resultados_son_alternativas:
                respuesta = (
                    f"No hay viajes de {ruta} para el {fecha_texto}. "
                    "Encontré opciones en otras fechas; revisa los horarios, precios y asientos de abajo."
                )
            elif viajes:
                fecha_detalle = f" para el {fecha_texto}" if fecha_texto else " en próximas fechas"
                respuesta = (
                    f"Encontré {len(viajes)} viaje(s) de {ruta}{fecha_detalle}. "
                    "Elige una opción para continuar con los asientos."
                )
            elif fecha_texto:
                respuesta = (
                    f"No encontré viajes de {ruta} para el {fecha_texto}. "
                    "Prueba con otra fecha o verifica el origen y el destino."
                )
            else:
                respuesta = (
                    f"No encontré viajes futuros de {ruta}. "
                    "Prueba cambiar la ruta o consultar más tarde."
                )
            if resultados_limitados:
                respuesta += " Se muestran algunas opciones; puedes indicar una fecha para acotar la búsqueda."
        else:
            if not settings.GEMINI_API_KEY.strip():
                return Response(
                    {"detail": "El asistente de IA aún no está configurado. Inténtalo más tarde."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            try:
                respuesta = generar_respuesta_gemini(
                    pregunta,
                    viajes,
                    resultados_limitados,
                    historial=datos.get("history", []),
                    busqueda=busqueda,
                    resultados_son_alternativas=resultados_son_alternativas,
                )
            except GeminiNotConfigured:
                return Response(
                    {"detail": "El asistente de IA aún no está configurado. Inténtalo más tarde."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            except GeminiProviderError:
                return Response(
                    {"detail": "No se pudo conectar con el asistente. Inténtalo de nuevo más tarde."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        return Response(
            {
                "answer": respuesta,
                "trips": viajes,
                "results_truncated": resultados_limitados,
                "trips_are_alternatives": resultados_son_alternativas,
            }
        )
