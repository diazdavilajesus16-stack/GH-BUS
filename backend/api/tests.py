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
