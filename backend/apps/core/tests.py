from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import RegistroAuditoria
from apps.drivers.models import Conductor
from apps.fleet.models import ConfiguracionAsientos, TipoDocumentoVehicular, Vehiculo
from apps.operations.models import Configuracion
from apps.routes.models import Ciudad, Ruta, Tarifa, TipoServicio
from apps.users.roles import ADMINISTRADOR, CAJERO, CLIENTE, CONDUCTOR, DESPACHADOR

User = get_user_model()
CLAVE = "Clave-Segura-2026!"
HOY = timezone.localdate()


def cliente_api(rol):
    u = User.objects.create_user(f"u_{rol}", f"{rol}@e.pe", CLAVE)
    u.groups.add(Group.objects.get(name=rol))
    c = APIClient()
    tok = c.post("/api/auth/login/", {"username": u.username, "password": CLAVE}, format="json").data["access"]
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok}")
    return c


class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = cliente_api(ADMINISTRADOR)
        self.moy = Ciudad.objects.create(nombre="Moyobamba", departamento="San Martín")
        self.tar = Ciudad.objects.create(nombre="Tarapoto", departamento="San Martín")
        self.rio = Ciudad.objects.create(nombre="Rioja", departamento="San Martín")
        self.servicio = TipoServicio.objects.create(codigo="COMFORT", nombre="Comfort Class")
        self.ruta = Ruta.objects.create(codigo="MOY-TAR", nombre="Moyobamba - Tarapoto", origen=self.moy,
                                        destino=self.tar, duracion_min=180)


class PermisosTests(Base):
    def test_matriz_de_roles(self):
        despachador, cajero = cliente_api(DESPACHADOR), cliente_api(CAJERO)
        self.assertEqual(self.admin.get("/api/rutas/").status_code, 200)
        self.assertEqual(despachador.get("/api/rutas/").status_code, 200)
        self.assertEqual(cajero.get("/api/rutas/").status_code, 200)  # necesita ver rutas para vender
        self.assertEqual(cajero.post("/api/rutas/", {}, format="json").status_code, 403)
        self.assertEqual(despachador.post("/api/rutas/", {}, format="json").status_code, 403)  # rutas: solo admin
        # flota y conductores: administrador y despachador
        for url in ("/api/vehiculos/", "/api/conductores/", "/api/licencias/", "/api/turnos/", "/api/mantenimientos/"):
            self.assertEqual(despachador.get(url).status_code, 200, url)
            self.assertEqual(cajero.get(url).status_code, 403, url)

    def test_conductor_y_cliente_sin_acceso_y_anonimo_401(self):
        for rol in (CONDUCTOR, CLIENTE):
            c = cliente_api(rol)
            for url in ("/api/rutas/", "/api/horarios/", "/api/vehiculos/", "/api/conductores/", "/api/configuracion/"):
                self.assertEqual(c.get(url).status_code, 403, (rol, url))
            User.objects.filter(username=f"u_{rol}").delete()
        self.assertEqual(APIClient().get("/api/rutas/").status_code, 401)

    def test_no_hay_borrado(self):
        self.assertEqual(self.admin.delete(f"/api/rutas/{self.ruta.pk}/").status_code, 405)

    def test_despachador_si_escribe_horarios(self):
        d = cliente_api(DESPACHADOR)
        r = d.post("/api/horarios/", {"ruta": self.ruta.pk, "tipo_servicio": self.servicio.pk, "hora_salida": "08:30",
                                      "dias_semana": 127, "vigente_desde": str(HOY)}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_page_size(self):
        for i in range(25):
            Ciudad.objects.create(nombre=f"C{i}", departamento="X")
        self.assertEqual(len(self.admin.get("/api/ciudades/").data["results"]), 20)
        self.assertEqual(len(self.admin.get("/api/ciudades/?page_size=100").data["results"]), 28)


class RutasTests(Base):
    def crear_ruta(self, **extra):
        d = {"codigo": " moy-rio ", "nombre": "Moyobamba - Rioja", "origen": self.moy.pk, "destino": self.rio.pk,
             "duracion_min": 40, **extra}
        return self.admin.post("/api/rutas/", d, format="json")

    def test_crear_normaliza_codigo_y_audita(self):
        r = self.crear_ruta()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["codigo"], "MOY-RIO")
        self.assertTrue(RegistroAuditoria.objects.filter(accion="CREAR", entidad="ruta", entidad_id=str(r.data["id"])).exists())

    def test_origen_igual_destino_y_codigo_duplicado(self):
        self.assertEqual(self.crear_ruta(destino=self.moy.pk).status_code, 400)
        self.assertEqual(self.crear_ruta(codigo="moy-tar").status_code, 400)
        self.assertEqual(self.crear_ruta(duracion_min=0).status_code, 400)

    def test_restricciones_en_base_de_datos(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Ruta.objects.create(codigo="X", nombre="x", origen=self.moy, destino=self.moy, duracion_min=10)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Ruta.objects.create(codigo="Y", nombre="y", origen=self.moy, destino=self.rio, duracion_min=0)

    def test_modificar_audita_solo_lo_que_cambia(self):
        r = self.admin.patch(f"/api/rutas/{self.ruta.pk}/", {"duracion_min": 200, "nombre": self.ruta.nombre}, format="json")
        self.assertEqual(r.status_code, 200)
        reg = RegistroAuditoria.objects.filter(accion="MODIFICAR", entidad="ruta").latest("id")
        self.assertEqual(reg.cambios, {"duracion_min": [180, 200]})

    def test_ciudad_desactivada_no_sirve_para_rutas_nuevas(self):
        self.rio.activa = False
        self.rio.save()
        self.assertEqual(self.crear_ruta().status_code, 400)

    def test_paradas(self):
        base = {"ruta": self.ruta.pk, "ciudad": self.rio.pk, "orden": 1, "minutos_desde_origen": 40}
        self.assertEqual(self.admin.post("/api/paradas/", base, format="json").status_code, 201)
        self.assertEqual(self.admin.post("/api/paradas/", {**base, "orden": 2}, format="json").status_code, 400)  # ciudad repetida
        otra = Ciudad.objects.create(nombre="Soritor", departamento="San Martín")
        self.assertEqual(self.admin.post("/api/paradas/", {**base, "ciudad": otra.pk, "orden": 2, "minutos_desde_origen": 999}, format="json").status_code, 400)
        self.assertEqual(self.admin.post("/api/paradas/", {**base, "ciudad": self.moy.pk, "orden": 3}, format="json").status_code, 400)  # el origen
        # no se puede acortar la ruta por debajo de su última parada
        self.assertEqual(self.admin.patch(f"/api/rutas/{self.ruta.pk}/", {"duracion_min": 40}, format="json").status_code, 400)


class TarifasHorariosTests(Base):
    def tarifa(self, desde, hasta=None, monto="35.00", **extra):
        d = {"ruta": self.ruta.pk, "tipo_servicio": self.servicio.pk, "monto": monto,
             "vigente_desde": str(desde), "vigente_hasta": str(hasta) if hasta else None, **extra}
        return self.admin.post("/api/tarifas/", d, format="json")

    def test_vigencias_no_se_cruzan(self):
        self.assertEqual(self.tarifa(date(2027, 1, 1), date(2027, 6, 30)).status_code, 201)
        self.assertEqual(self.tarifa(date(2027, 6, 30), date(2027, 12, 31)).status_code, 400)  # comparte el último día
        self.assertEqual(self.tarifa(date(2027, 7, 1)).status_code, 201)  # abierta, empieza al día siguiente
        self.assertEqual(self.tarifa(date(2028, 1, 1)).status_code, 400)  # se cruza con la abierta
        self.assertEqual(self.tarifa(date(2026, 1, 1), date(2026, 12, 31)).status_code, 201)

    def test_tarifa_inactiva_no_bloquea(self):
        self.tarifa(date(2027, 1, 1), activa=False)
        self.assertEqual(self.tarifa(date(2027, 3, 1)).status_code, 201)

    def test_monto_y_fechas_invalidos(self):
        self.assertEqual(self.tarifa(date(2027, 1, 1), monto="0").status_code, 400)
        self.assertEqual(self.tarifa(date(2027, 5, 1), date(2027, 1, 1)).status_code, 400)

    def test_editar_tarifa_no_choca_consigo_misma(self):
        t = self.tarifa(date(2027, 1, 1), date(2027, 6, 30)).data
        self.assertEqual(self.admin.patch(f"/api/tarifas/{t['id']}/", {"monto": "40.00"}, format="json").status_code, 200)

    def test_horario_dias_y_duplicado(self):
        h = {"ruta": self.ruta.pk, "tipo_servicio": self.servicio.pk, "hora_salida": "22:00", "dias_semana": 0,
             "vigente_desde": str(HOY)}
        self.assertEqual(self.admin.post("/api/horarios/", h, format="json").status_code, 400)
        h["dias_semana"] = 1 | 4 | 16
        self.assertEqual(self.admin.post("/api/horarios/", h, format="json").status_code, 201)
        self.assertEqual(self.admin.post("/api/horarios/", h, format="json").status_code, 400)  # mismo horario y vigencia


class FlotaTests(Base):
    def crear_config(self, **extra):
        d = {"nombre": "Bus 2 pisos", "pisos": [{"filas": 8, "asientos_por_fila": 4}, {"filas": 5, "asientos_por_fila": 4}], **extra}
        return self.admin.post("/api/configuraciones-asientos/", d, format="json")

    def test_genera_distribucion_de_asientos(self):
        r = self.crear_config()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.data["pisos"], r.data["total_asientos"]), (2, 52))
        a = r.data["asientos"]
        self.assertEqual([x["numero"] for x in a], list(range(1, 53)))
        self.assertEqual(sum(1 for x in a if x["piso"] == 2), 20)
        self.assertEqual(a[0]["categoria"], "VENTANA")
        self.assertEqual(a[1]["categoria"], "PASILLO")

    def test_limites_y_edicion_restringida(self):
        self.assertEqual(self.crear_config(pisos=[{"filas": 20, "asientos_por_fila": 5}]).status_code, 400)  # 100 > 80
        self.assertEqual(self.crear_config(pisos=[]).status_code, 400)
        cid = self.crear_config().data["id"]
        self.assertEqual(self.crear_config().status_code, 400)  # nombre repetido
        r = self.admin.patch(f"/api/configuraciones-asientos/{cid}/", {"nombre": "Otro nombre", "total_asientos": 3}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.data["nombre"], r.data["total_asientos"]), ("Otro nombre", 52))

    def vehiculo(self, **extra):
        cfg = ConfiguracionAsientos.objects.first() or ConfiguracionAsientos.objects.get(pk=self.crear_config().data["id"])
        d = {"placa": " abc-123 ", "marca": "Volvo", "modelo": "9700", "anio": 2022,
             "configuracion_asientos": cfg.pk, "tipo_servicio": self.servicio.pk, **extra}
        return self.admin.post("/api/vehiculos/", d, format="json")

    def test_vehiculo(self):
        r = self.vehiculo()
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.data["placa"], r.data["capacidad"], r.data["estado"]), ("ABC-123", 52, "DISPONIBLE"))
        self.assertEqual(self.vehiculo(placa="abc-123").status_code, 400)
        self.assertEqual(self.vehiculo(placa="a b").status_code, 400)
        self.assertEqual(self.vehiculo(placa="XYZ-999", anio=1900).status_code, 400)
        self.assertEqual(self.vehiculo(placa="XYZ-999", estado="EN_VIAJE").status_code, 400)

    def test_en_viaje_no_se_toca_a_mano(self):
        v = Vehiculo.objects.get(pk=self.vehiculo().data["id"])
        Vehiculo.objects.filter(pk=v.pk).update(estado="EN_VIAJE")
        self.assertEqual(self.admin.patch(f"/api/vehiculos/{v.pk}/", {"estado": "DISPONIBLE"}, format="json").status_code, 400)
        self.assertEqual(self.admin.patch(f"/api/vehiculos/{v.pk}/", {"activo": False}, format="json").status_code, 400)
        self.assertEqual(self.admin.patch(f"/api/vehiculos/{v.pk}/", {"kilometraje": 1000}, format="json").status_code, 200)

    def test_tipos_de_documento_semilla_y_situacion(self):
        self.assertEqual(TipoDocumentoVehicular.objects.count(), 5)
        self.assertEqual(set(TipoDocumentoVehicular.objects.filter(bloquea_asignacion=True).values_list("codigo", flat=True)),
                         {"SOAT", "REV_TECNICA"})
        vid = self.vehiculo().data["id"]
        soat = TipoDocumentoVehicular.objects.get(codigo="SOAT")

        def doc(dias):
            return self.admin.post("/api/documentos-vehiculares/", {
                "vehiculo": vid, "tipo": soat.pk, "numero": f"N{dias}",
                "fecha_emision": str(HOY - timedelta(days=400)), "fecha_vencimiento": str(HOY + timedelta(days=dias))}, format="json")

        self.assertEqual(doc(-1).data["situacion"], "VENCIDO")
        self.assertEqual(doc(10).data["situacion"], "POR_VENCER")
        self.assertEqual(doc(200).data["situacion"], "VIGENTE")
        r = self.admin.post("/api/documentos-vehiculares/", {"vehiculo": vid, "tipo": soat.pk, "numero": "X",
                            "fecha_emision": "2027-05-01", "fecha_vencimiento": "2027-01-01"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_mantenimiento_registra_al_usuario(self):
        vid = self.vehiculo().data["id"]
        r = self.admin.post("/api/mantenimientos/", {"vehiculo": vid, "tipo": "PREVENTIVO", "descripcion": "Cambio de aceite",
                            "fecha_inicio": str(HOY), "costo": "350.00"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["estado"], "PROGRAMADO")
        self.assertEqual(self.admin.post("/api/mantenimientos/", {"vehiculo": vid, "tipo": "PREVENTIVO", "descripcion": "x",
                         "fecha_inicio": str(HOY), "fecha_fin": str(HOY - timedelta(days=1))}, format="json").status_code, 400)


class ConductoresTests(Base):
    datos = {"dni": "12345678", "nombres": "Juan", "apellidos": "Pérez", "telefono": "+51 999 888 777"}

    def test_dni(self):
        self.assertEqual(self.admin.post("/api/conductores/", {**self.datos, "dni": "123"}, format="json").status_code, 400)
        self.assertEqual(self.admin.post("/api/conductores/", self.datos, format="json").status_code, 201)
        self.assertEqual(self.admin.post("/api/conductores/", self.datos, format="json").status_code, 400)

    def test_vinculo_con_usuario_exige_rol_conductor(self):
        sin_rol = User.objects.create_user("sinrol", "s@e.pe", CLAVE)
        self.assertEqual(self.admin.post("/api/conductores/", {**self.datos, "usuario": sin_rol.pk}, format="json").status_code, 400)
        sin_rol.groups.add(Group.objects.get(name=CONDUCTOR))
        r = self.admin.post("/api/conductores/", {**self.datos, "usuario": sin_rol.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["usuario_username"], "sinrol")

    def test_licencias_y_vencimiento_en_la_lista(self):
        cid = self.admin.post("/api/conductores/", self.datos, format="json").data["id"]
        lic = {"conductor": cid, "numero": "q12345678", "categoria": "A-IIIb",
               "fecha_emision": "2024-01-01", "fecha_vencimiento": "2029-01-01"}
        r = self.admin.post("/api/licencias/", lic, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["numero"], "Q12345678")
        self.assertEqual(self.admin.post("/api/licencias/", lic, format="json").status_code, 400)
        self.assertEqual(self.admin.post("/api/licencias/", {**lic, "numero": "Z", "categoria": "B-I"}, format="json").status_code, 400)
        lista = self.admin.get("/api/conductores/").data["results"]
        self.assertEqual(lista[0]["licencia_vence"], "2029-01-01")
        Conductor.objects.get(pk=cid)  # sigue existiendo

    def test_turnos_no_se_cruzan(self):
        cid = self.admin.post("/api/conductores/", self.datos, format="json").data["id"]
        t = {"conductor": cid, "tipo": "TURNO", "inicio": "2027-02-01T08:00:00-05:00", "fin": "2027-02-01T16:00:00-05:00"}
        self.assertEqual(self.admin.post("/api/turnos/", t, format="json").status_code, 201)
        self.assertEqual(self.admin.post("/api/turnos/", {**t, "tipo": "DESCANSO", "inicio": "2027-02-01T15:00:00-05:00",
                         "fin": "2027-02-01T20:00:00-05:00"}, format="json").status_code, 400)
        self.assertEqual(self.admin.post("/api/turnos/", {**t, "inicio": "2027-02-01T16:00:00-05:00",
                         "fin": "2027-02-02T00:00:00-05:00"}, format="json").status_code, 201)  # justo después
        self.assertEqual(self.admin.post("/api/turnos/", {**t, "fin": "2027-02-01T07:00:00-05:00"}, format="json").status_code, 400)


class ConfiguracionTests(Base):
    def test_valores_iniciales(self):
        self.assertEqual(Configuracion.objects.get(clave="bloqueo_asiento_minutos").valor, "10")
        self.assertEqual(len(self.admin.get("/api/configuracion/").data), 7)

    def test_validacion_por_clave(self):
        url = "/api/configuracion/bloqueo_asiento_minutos/"
        self.assertEqual(self.admin.patch(url, {"valor": "15"}, format="json").status_code, 200)
        for malo in ("abc", "-5", "0", "9999"):
            self.assertEqual(self.admin.patch(url, {"valor": malo}, format="json").status_code, 400, malo)
        url = "/api/configuracion/categorias_licencia_permitidas/"
        self.assertEqual(self.admin.patch(url, {"valor": "A-IIIa, A-IIIc"}, format="json").data["valor"], "A-IIIa,A-IIIc")
        self.assertEqual(self.admin.patch(url, {"valor": "XX"}, format="json").status_code, 400)
        reg = RegistroAuditoria.objects.filter(entidad="configuracion", accion="MODIFICAR").first()
        self.assertIsNotNone(reg)

    def test_solo_admin_modifica_y_no_se_crea(self):
        d = cliente_api(DESPACHADOR)
        self.assertEqual(d.get("/api/configuracion/").status_code, 200)
        self.assertEqual(d.patch("/api/configuracion/igv_porcentaje/", {"valor": "10"}, format="json").status_code, 403)
        self.assertEqual(self.admin.post("/api/configuracion/", {"clave": "x", "valor": "1"}, format="json").status_code, 405)
        self.assertEqual(Configuracion.objects.get(clave="igv_porcentaje").valor, "18")
