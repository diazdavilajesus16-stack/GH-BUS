from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.users.roles import ADMINISTRADOR

from .models import RegistroAuditoria
from .services import Accion, registrar

User = get_user_model()
CLAVE = "Clave-Segura-2026!"


class BitacoraTests(TestCase):
    def test_es_inmutable(self):
        r = RegistroAuditoria.objects.create(accion="OTRO", entidad="x")
        r.entidad = "y"
        with self.assertRaises(Exception):
            r.save()
        with self.assertRaises(Exception):
            r.delete()

    def test_registrar_no_rompe_con_datos_raros(self):
        registrar(accion=Accion.OTRO, entidad="x", cambios={"a": object()})  # no serializable: se ignora sin romper
        registrar(accion=Accion.OTRO, entidad="x", entidad_id=5)
        self.assertTrue(RegistroAuditoria.objects.filter(entidad_id="5").exists())

    def test_consulta_solo_admin_y_filtros(self):
        admin = User.objects.create_user("admin", "a@e.pe", CLAVE)
        admin.groups.add(Group.objects.get(name=ADMINISTRADOR))
        registrar(accion=Accion.CREAR, entidad="viaje", usuario=admin)
        registrar(accion=Accion.ANULAR, entidad="boleto", usuario=admin)
        c = APIClient()
        self.assertEqual(c.get("/api/auditoria/").status_code, 401)
        tok = c.post("/api/auth/login/", {"username": "admin", "password": CLAVE}, format="json").data["access"]
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok}")
        r = c.get("/api/auditoria/?accion=ANULAR")
        self.assertEqual(r.status_code, 200)
        self.assertEqual([x["entidad"] for x in r.data["results"]], ["boleto"])
        self.assertEqual(c.post("/api/auditoria/", {}, format="json").status_code, 405)
        self.assertEqual(c.delete("/api/auditoria/1/").status_code, 405)
