from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase


class ApiBaseTests(APITestCase):
    def test_health_es_publico_y_confirma_base_de_datos(self):
        resp = self.client.get(reverse("health"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "ok", "database": "ok"})

    def test_documentacion_swagger_disponible(self):
        self.assertEqual(self.client.get(reverse("schema")).status_code, 200)
        self.assertEqual(self.client.get(reverse("docs")).status_code, 200)

    def test_login_jwt_devuelve_tokens(self):
        get_user_model().objects.create_user(
            username="prueba", email="prueba@example.com", password="Clave-segura-123"
        )
        resp = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "prueba", "password": "Clave-segura-123"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("access", resp.json())
        self.assertIn("refresh", resp.json())

    def test_credenciales_incorrectas_rechazadas(self):
        resp = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "nadie", "password": "mal"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)
