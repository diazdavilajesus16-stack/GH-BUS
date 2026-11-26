import json
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIRequestFactory, APITestCase

from apps.routes.models import Ciudad, Ruta
from api.assistant import generar_respuesta_gemini
from api.views import AssistantChatRequestSerializer, AssistantChatView


class AssistantRequestTests(SimpleTestCase):
    def test_date_in_message_is_not_rejected_as_sensitive_data(self):
        serializer = AssistantChatRequestSerializer(
            data={"message": "¿Hay viajes disponibles el 2026-06-12?"}
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_phone_number_in_message_is_rejected(self):
        serializer = AssistantChatRequestSerializer(data={"message": "Mi teléfono es 999999999"})

        self.assertFalse(serializer.is_valid())
        self.assertIn("message", serializer.errors)

    def test_phone_number_in_conversation_history_is_rejected(self):
        serializer = AssistantChatRequestSerializer(
            data={
                "message": "¿Cómo reservo?",
                "history": [{"role": "user", "content": "Mi teléfono es 999999999"}],
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("history", serializer.errors)

    @override_settings(GEMINI_API_KEY="")
    def test_unconfigured_assistant_returns_service_unavailable(self):
        request = APIRequestFactory().post(
            "/api/assistant/chat/",
            {"message": "¿Cómo puedo reservar?"},
            format="json",
        )

        with patch.object(AssistantChatView, "throttle_classes", []):
            response = AssistantChatView.as_view()(request)

        self.assertEqual(response.status_code, 503)
        self.assertIn("no está configurado", response.data["detail"])

    @override_settings(GEMINI_API_KEY="test-key")
    @patch("api.views.generar_respuesta_gemini", return_value="Puedes elegir una fecha disponible.")
    def test_chat_forwards_previous_turns_to_gemini(self, generar_respuesta):
        history = [
            {"role": "user", "content": "No hay viaje el 30/12/2026."},
            {"role": "assistant", "content": "Encontré opciones en otras fechas."},
        ]
        request = APIRequestFactory().post(
            "/api/assistant/chat/",
            {"message": "¿Puedo reservar una?", "history": history},
            format="json",
        )

        with patch.object(AssistantChatView, "throttle_classes", []):
            response = AssistantChatView.as_view()(request)

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(generar_respuesta.call_args.kwargs["historial"], history)


class GeminiRequestTests(SimpleTestCase):
    @override_settings(GEMINI_API_KEY="test-key", GEMINI_MODEL="gemini-test")
    @patch("api.assistant.urlopen")
    def test_gemini_receives_public_trip_details_without_internal_id(self, urlopen):
        response = urlopen.return_value.__enter__.return_value
        response.read.return_value = json.dumps(
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "Hay un viaje "},
                                {"text": "disponible."},
                            ]
                        }
                    }
                ]
            }
        ).encode()
        trip = {
            "id": 123,
            "codigo": "BUS-123",
            "origen": "Lima",
            "destino": "Cusco",
            "salida": "2026-06-12T08:00:00-05:00",
            "servicio": "Ejecutivo",
            "precio": "75.00",
            "capacidad": 40,
            "asientos_disponibles": 12,
        }

        answer = generar_respuesta_gemini(
            "¿Hay viajes?",
            [trip],
            False,
            historial=[
                {"role": "user", "content": "Busco un viaje para otra fecha."},
                {"role": "assistant", "content": "No hay viajes ese día."},
            ],
            busqueda={
                "origen": "Lima",
                "destino": "Cusco",
                "fecha_solicitada": "2026-06-12",
            },
            resultados_son_alternativas=True,
        )

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        sent_facts = json.loads(payload["contents"][-1]["parts"][0]["text"])
        self.assertEqual(answer, "Hay un viaje disponible.")
        self.assertEqual(request.get_header("X-goog-api-key"), "test-key")
        self.assertNotIn("id", sent_facts["viajes_disponibles"][0])
        self.assertEqual(sent_facts["viajes_disponibles"][0]["asientos_disponibles"], 12)
        self.assertEqual(sent_facts["busqueda"]["fecha_solicitada"], "2026-06-12")
        self.assertTrue(sent_facts["resultados_son_alternativas"])
        self.assertEqual(payload["contents"][0]["role"], "user")
        self.assertEqual(payload["contents"][0]["parts"][0]["text"], "Busco un viaje para otra fecha.")
        self.assertEqual(payload["contents"][1]["role"], "model")
        self.assertEqual(payload["contents"][1]["parts"][0]["text"], "No hay viajes ese día.")


class PublicDestinationTests(APITestCase):
    def test_lists_cities_on_active_routes_without_authentication(self):
        origen = Ciudad.objects.create(nombre="Lima", departamento="Lima")
        destino = Ciudad.objects.create(nombre="Cusco", departamento="Cusco")
        inactive_city = Ciudad.objects.create(
            nombre="Ciudad inactiva",
            departamento="Prueba",
            activa=False,
        )
        without_route = Ciudad.objects.create(nombre="Sin ruta", departamento="Prueba")
        Ruta.objects.create(
            codigo="LIM-CUS",
            nombre="Lima - Cusco",
            origen=origen,
            destino=destino,
            duracion_min=600,
        )
        Ruta.objects.create(
            codigo="LIM-INA",
            nombre="Lima - Ciudad inactiva",
            origen=origen,
            destino=inactive_city,
            duracion_min=600,
        )
        Ruta.objects.create(
            codigo="LIM-SIN",
            nombre="Lima - Sin ruta",
            origen=origen,
            destino=without_route,
            duracion_min=600,
            activa=False,
        )

        response = self.client.get("/api/assistant/destinations/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            [
                {"id": destino.id, "nombre": "Cusco", "departamento": "Cusco"},
                {"id": origen.id, "nombre": "Lima", "departamento": "Lima"},
            ],
        )
