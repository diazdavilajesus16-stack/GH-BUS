import threading
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.db import connection, connections
from django.test import TestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import RegistroAuditoria
from apps.core.tests import cliente_api
from apps.drivers.models import Conductor, Licencia, TurnoConductor
from apps.fleet.models import AsientoPlantilla, ConfiguracionAsientos, DocumentoVehicular, Mantenimiento, TipoDocumentoVehicular, Vehiculo
from apps.operations.models import Configuracion, Incidencia
from apps.passengers.models import Passenger
from apps.reservations.models import Reservation, ReservationSeat
from apps.reservations.services import asientos_ocupados_por_viaje
from apps.routes.models import Ciudad, Horario, Ruta, Tarifa, TipoServicio
from apps.tickets.models import Ticket
from apps.users.roles import ADMINISTRADOR, CAJERO, CONDUCTOR, DESPACHADOR

from . import services
from .models import Viaje

User = get_user_model()
CLAVE = "Clave-Segura-2026!"
HOY = timezone.localdate()


def en(horas=0, dias=0):
    """Instante futuro, redondeado al minuto."""
    return (timezone.now() + timedelta(days=dias, hours=horas)).replace(second=0, microsecond=0)


class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = cliente_api(ADMINISTRADOR)
        self.moy = Ciudad.objects.create(nombre="Moyobamba", departamento="San Martín")
        self.tar = Ciudad.objects.create(nombre="Tarapoto", departamento="San Martín")
        self.servicio = TipoServicio.objects.create(codigo="COMFORT", nombre="Comfort Class")
        self.otro_servicio = TipoServicio.objects.create(codigo="ECO", nombre="Económico")
        self.ruta = Ruta.objects.create(codigo="MOY-TAR", nombre="Moyobamba - Tarapoto", origen=self.moy, destino=self.tar, duracion_min=180)
        Tarifa.objects.create(ruta=self.ruta, tipo_servicio=self.servicio, monto=Decimal("25.00"), vigente_desde=date(2026, 1, 1))
        cfg = ConfiguracionAsientos.objects.create(nombre="Bus", pisos=1, total_asientos=4)
        AsientoPlantilla.objects.create(configuracion=cfg, numero=1, piso=1, fila=1, columna=1)
        self.vehiculo = Vehiculo.objects.create(placa="AAA-111", marca="V", modelo="9", anio=2022, configuracion_asientos=cfg, tipo_servicio=self.servicio)
        self.vehiculo2 = Vehiculo.objects.create(placa="BBB-222", marca="V", modelo="9", anio=2022, configuracion_asientos=cfg, tipo_servicio=self.servicio)
        for v in (self.vehiculo, self.vehiculo2):
            self.dar_documentos(v)
        self.chofer = self.nuevo_conductor("11111111", "AAA")
        self.chofer2 = self.nuevo_conductor("22222222", "BBB")

    def dar_documentos(self, vehiculo, dias=400):
        for t in TipoDocumentoVehicular.objects.filter(bloquea_asignacion=True):
            DocumentoVehicular.objects.create(vehiculo=vehiculo, tipo=t, numero="N", fecha_emision=HOY - timedelta(days=10), fecha_vencimiento=HOY + timedelta(days=dias))

    def nuevo_conductor(self, dni, nombre, categoria="A-IIIb", vence_en=900, usuario=None):
        c = Conductor.objects.create(dni=dni, nombres=nombre, apellidos="Prueba", usuario=usuario)
        Licencia.objects.create(conductor=c, numero=f"L{dni}", categoria=categoria, fecha_emision=HOY - timedelta(days=100), fecha_vencimiento=HOY + timedelta(days=vence_en))
        return c

    def viaje(self, salida=None, servicio=None, **extra):
        return services.crear_viaje(ruta=self.ruta, tipo_servicio=servicio or self.servicio, salida_programada=salida or en(48),
                                    usuario=User.objects.get(username="u_administrador"), **extra)

    def api(self, metodo, url, datos=None, cli=None):
        return getattr(cli or self.admin, metodo)(url, datos, format="json")

    def poner_vehiculo(self, v, vehiculo=None):
        return self.api("post", f"/api/viajes/{v.pk}/vehiculo/", {"vehiculo": (vehiculo or self.vehiculo).pk})

    def poner_conductor(self, v, conductor=None, rol="PRINCIPAL"):
        return self.api("post", f"/api/viajes/{v.pk}/conductor/", {"conductor": (conductor or self.chofer).pk, "rol": rol})

    def estado(self, v, nuevo, obs=""):
        return self.api("post", f"/api/viajes/{v.pk}/estado/", {"estado": nuevo, "observacion": obs})


class GeneracionTests(Base):
    def horario(self, dias=127, hora="08:00", **extra):
        return Horario.objects.create(ruta=self.ruta, tipo_servicio=self.servicio, hora_salida=hora, dias_semana=dias, vigente_desde=HOY - timedelta(days=30), **extra)

    def test_genera_segun_dias_y_no_duplica(self):
        self.horario(dias=1 | 4)  # lunes y miércoles
        desde, hasta = HOY + timedelta(days=1), HOY + timedelta(days=14)
        r = self.api("post", "/api/viajes/generar/", {"desde": str(desde), "hasta": str(hasta)})
        self.assertEqual(r.status_code, 200, r.content)
        esperados = sum(1 for i in range(1, 15) if (HOY + timedelta(days=i)).weekday() in (0, 2))
        self.assertEqual(r.data["creados"], esperados)
        self.assertEqual(Viaje.objects.count(), esperados)
        r2 = self.api("post", "/api/viajes/generar/", {"desde": str(desde), "hasta": str(hasta)})
        self.assertEqual((r2.data["creados"], r2.data["ya_existian"]), (0, esperados))
        v = Viaje.objects.first()
        self.assertEqual(v.codigo, f"V{v.pk:07d}")
        self.assertEqual(v.llegada_programada - v.salida_programada, timedelta(minutes=180))
        self.assertEqual(v.historial.count(), 1)

    def test_precio_congelado_y_tarifa_por_fecha(self):
        self.horario()
        self.api("post", "/api/viajes/generar/", {"desde": str(HOY + timedelta(days=1)), "hasta": str(HOY + timedelta(days=1))})
        Tarifa.objects.update(monto=Decimal("99.00"))
        self.assertEqual(Viaje.objects.get().precio_base, Decimal("25.00"))

    def test_sin_tarifa_se_informa_y_no_se_crea(self):
        Tarifa.objects.all().delete()
        self.horario()
        r = self.api("post", "/api/viajes/generar/", {"desde": str(HOY + timedelta(days=1)), "hasta": str(HOY + timedelta(days=2))})
        self.assertEqual(r.data["creados"], 0)
        self.assertEqual(len(r.data["sin_tarifa"]), 2)

    def test_pasado_inactivos_y_limites(self):
        self.horario(hora="00:01")
        r = self.api("post", "/api/viajes/generar/", {"desde": str(HOY - timedelta(days=3)), "hasta": str(HOY - timedelta(days=1))})
        self.assertEqual((r.data["creados"], r.data["en_el_pasado"]), (0, 3))
        Horario.objects.update(activo=False)
        r = self.api("post", "/api/viajes/generar/", {"desde": str(HOY + timedelta(days=1)), "hasta": str(HOY + timedelta(days=3))})
        self.assertEqual(r.data["creados"], 0)
        self.assertEqual(self.api("post", "/api/viajes/generar/", {"desde": str(HOY), "hasta": str(HOY + timedelta(days=100))}).status_code, 400)
        self.assertEqual(self.api("post", "/api/viajes/generar/", {"desde": str(HOY + timedelta(days=5)), "hasta": str(HOY)}).status_code, 400)

    def test_viaje_manual(self):
        r = self.api("post", "/api/viajes/", {"ruta": self.ruta.pk, "tipo_servicio": self.servicio.pk, "salida_programada": en(30).isoformat()})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.data["precio_base"], r.data["estado"]), ("25.00", "PROGRAMADO"))
        pasado = self.api("post", "/api/viajes/", {"ruta": self.ruta.pk, "tipo_servicio": self.servicio.pk, "salida_programada": en(-2).isoformat()})
        self.assertEqual(pasado.status_code, 400)
        sin_tarifa = self.api("post", "/api/viajes/", {"ruta": self.ruta.pk, "tipo_servicio": self.otro_servicio.pk, "salida_programada": en(30).isoformat()})
        self.assertEqual(sin_tarifa.status_code, 400)
        con_precio = self.api("post", "/api/viajes/", {"ruta": self.ruta.pk, "tipo_servicio": self.otro_servicio.pk, "salida_programada": en(30).isoformat(), "precio_base": "18.50"})
        self.assertEqual(con_precio.status_code, 201)

    def test_editar_viaje(self):
        v = self.viaje()
        self.assertEqual(self.api("patch", f"/api/viajes/{v.pk}/", {"precio_base": "30.00"}).status_code, 200)
        self.poner_vehiculo(v)
        r = self.api("patch", f"/api/viajes/{v.pk}/", {"salida_programada": en(60).isoformat()})
        self.assertEqual(r.status_code, 400)  # con vehículo asignado no se mueve la hora
        self.api("post", f"/api/viajes/{v.pk}/vehiculo/", {"vehiculo": None})
        r = self.api("patch", f"/api/viajes/{v.pk}/", {"salida_programada": en(60).isoformat()})
        self.assertEqual(r.status_code, 200)
        v.refresh_from_db()
        self.assertEqual(v.llegada_programada - v.salida_programada, timedelta(minutes=180))


class VehiculoTests(Base):
    def test_asigna_y_deja_historial_y_auditoria(self):
        v = self.viaje()
        r = self.poner_vehiculo(v)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.data["vehiculo_placa"], r.data["capacidad"]), ("AAA-111", 4))
        self.assertTrue(v.historial.filter(observacion__contains="AAA-111").exists())
        self.assertTrue(RegistroAuditoria.objects.filter(entidad="viaje", entidad_id=str(v.pk), accion="MODIFICAR").exists())

    def test_documentos_bloqueantes(self):
        v = self.viaje()
        DocumentoVehicular.objects.filter(vehiculo=self.vehiculo2).delete()
        r = self.poner_vehiculo(v, self.vehiculo2)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(len(r.data["motivos"]), 2)  # sin SOAT y sin revisión técnica, ambos informados a la vez
        self.dar_documentos(self.vehiculo2, dias=1)  # vence antes de que termine el viaje (llega en ~2 días)
        r = self.poner_vehiculo(v, self.vehiculo2)
        self.assertEqual(r.status_code, 400)
        self.assertIn("vence el", r.data["detail"])
        self.dar_documentos(self.vehiculo2, dias=300)  # renovado: el más reciente manda
        self.assertEqual(self.poner_vehiculo(v, self.vehiculo2).status_code, 200)

    def test_otros_requisitos(self):
        v = self.viaje()
        self.vehiculo.estado = "MANTENIMIENTO"
        self.vehiculo.save()
        self.assertEqual(self.poner_vehiculo(v).status_code, 400)
        self.vehiculo.estado = "DISPONIBLE"
        self.vehiculo.save()
        veco = self.viaje(servicio=self.otro_servicio, precio_base="10.00")
        self.assertEqual(self.poner_vehiculo(veco).status_code, 400)  # servicio distinto
        Mantenimiento.objects.create(vehiculo=self.vehiculo, tipo="PREVENTIVO", estado="PROGRAMADO", descripcion="Frenos",
                                     fecha_inicio=timezone.localdate(v.salida_programada), registrado_por=User.objects.first())
        r = self.poner_vehiculo(v)
        self.assertEqual(r.status_code, 400)
        self.assertIn("mantenimiento", r.data["detail"])

    def test_cruces_y_margen(self):
        a = self.viaje(en(48))                         # sale +48h, llega +51h
        self.assertEqual(self.poner_vehiculo(a).status_code, 200)
        b = self.viaje(en(50))                         # se cruza
        self.assertEqual(self.poner_vehiculo(b).status_code, 409)
        c = self.viaje(en(51.5))                       # 30 min después de llegar: dentro del margen de 60
        r = self.poner_vehiculo(c)
        self.assertEqual(r.status_code, 409)
        self.assertIn("margen de 60 min", r.data["detail"])
        d = self.viaje(en(52.1))                       # 66 min después: libre
        self.assertEqual(self.poner_vehiculo(d).status_code, 200)
        self.assertEqual(self.poner_vehiculo(b, self.vehiculo2).status_code, 200)  # otro bus sí

    def test_un_viaje_cancelado_libera_el_bus(self):
        a = self.viaje(en(48))
        self.poner_vehiculo(a)
        self.estado(a, "CANCELADO", "Sin pasajeros")
        self.assertEqual(self.poner_vehiculo(self.viaje(en(49))).status_code, 200)

    def test_reasignar_el_mismo_bus_no_choca_consigo_mismo(self):
        a = self.viaje()
        self.poner_vehiculo(a)
        self.assertEqual(self.poner_vehiculo(a).status_code, 200)

    def test_margen_configurable(self):
        Configuracion.objects.filter(clave="margen_entre_viajes_min").update(valor="0")
        a = self.viaje(en(48))
        self.poner_vehiculo(a)
        self.assertEqual(self.poner_vehiculo(self.viaje(en(51.5))).status_code, 200)


class ConductorTests(Base):
    def test_asigna_y_rol_principal_unico(self):
        v = self.viaje()
        self.assertEqual(self.poner_conductor(v).status_code, 200)
        r = self.poner_conductor(v, self.chofer2)
        self.assertEqual(r.status_code, 400)
        self.assertIn("principal", r.data["detail"])
        r = self.poner_conductor(v, self.chofer2, "COPILOTO")
        self.assertEqual(len(r.data["conductores"]), 2)
        self.assertEqual(self.poner_conductor(v).status_code, 400)  # ya asignado
        self.api("post", f"/api/viajes/{v.pk}/quitar-conductor/", {"conductor": self.chofer.pk})
        self.assertEqual(self.poner_conductor(v, self.chofer2).status_code, 400)  # ya está como copiloto
        self.assertEqual(self.poner_conductor(v).status_code, 200)  # reactivar al quitado

    def test_licencia(self):
        v = self.viaje()
        vencida = self.nuevo_conductor("33333333", "VEN", vence_en=1)  # vence antes de llegar
        r = self.poner_conductor(v, vencida)
        self.assertEqual((r.status_code, "vence el" in r.data["detail"]), (400, True))
        mala = self.nuevo_conductor("44444444", "CAT", categoria="A-I")
        r = self.poner_conductor(v, mala)
        self.assertEqual(r.status_code, 400)
        self.assertIn("categoría", r.data["detail"])
        Licencia.objects.filter(conductor=mala).update(activa=False)
        self.assertIn("no tiene licencia activa", self.poner_conductor(v, mala).data["detail"])

    def test_vacaciones_y_turno(self):
        v = self.viaje()
        TurnoConductor.objects.create(conductor=self.chofer, tipo="VACACIONES", inicio=v.salida_programada - timedelta(days=1), fin=v.salida_programada + timedelta(days=5))
        self.assertEqual(self.poner_conductor(v).status_code, 400)
        TurnoConductor.objects.create(conductor=self.chofer2, tipo="TURNO", inicio=v.salida_programada - timedelta(hours=1), fin=v.llegada_programada)
        self.assertEqual(self.poner_conductor(v, self.chofer2).status_code, 200)  # un turno normal no bloquea

    def test_descanso_minimo(self):
        a = self.viaje(en(48))                          # llega +51h
        self.poner_conductor(a)
        b = self.viaje(en(55))                          # 4 h después de llegar: falta descanso
        r = self.poner_conductor(b)
        self.assertEqual(r.status_code, 409)
        self.assertIn("descanso de 8 h", r.data["detail"])
        c = self.viaje(en(60))                          # 9 h después: ok
        self.assertEqual(self.poner_conductor(c).status_code, 200)

    def test_no_se_asigna_a_viaje_en_curso(self):
        v = self.viaje()
        self.poner_vehiculo(v)
        self.poner_conductor(v)
        self.estado(v, "CONFIRMADO")
        self.estado(v, "EN_EMBARQUE")
        self.assertEqual(self.poner_conductor(v, self.chofer2, "COPILOTO").status_code, 400)
        self.assertEqual(self.poner_vehiculo(v, self.vehiculo2).status_code, 400)


class EstadosTests(Base):
    def listo(self):
        v = self.viaje()
        self.poner_vehiculo(v)
        self.poner_conductor(v)
        return v

    def test_flujo_completo_con_historial_y_vehiculo(self):
        v = self.listo()
        for nuevo in ("CONFIRMADO", "EN_EMBARQUE"):
            self.assertEqual(self.estado(v, nuevo).status_code, 200, nuevo)
        self.vehiculo.refresh_from_db()
        self.assertEqual(self.vehiculo.estado, "EN_VIAJE")
        r = self.estado(v, "EN_RUTA")
        self.assertIsNotNone(r.data["salida_real"])
        self.assertEqual(self.estado(v, "RETRASADO").status_code, 400)  # exige motivo
        self.assertEqual(self.estado(v, "RETRASADO", "Lluvia fuerte").status_code, 200)
        self.assertEqual(self.estado(v, "EN_RUTA").status_code, 200)
        r = self.estado(v, "FINALIZADO")
        self.assertIsNotNone(r.data["llegada_real"])
        self.vehiculo.refresh_from_db()
        self.assertEqual(self.vehiculo.estado, "DISPONIBLE")
        h = self.api("get", f"/api/viajes/{v.pk}/historial/").data
        self.assertEqual([x["estado_nuevo"] for x in h if x["estado_anterior"] != x["estado_nuevo"]],
                         ["PROGRAMADO", "CONFIRMADO", "EN_EMBARQUE", "EN_RUTA", "RETRASADO", "EN_RUTA", "FINALIZADO"])
        self.assertEqual(self.estado(v, "EN_RUTA").status_code, 400)  # estado final

    def test_transiciones_invalidas(self):
        v = self.listo()
        r = self.estado(v, "EN_RUTA")
        self.assertEqual(r.status_code, 400)
        self.assertIn("No se puede pasar de «Programado» a «En ruta»", r.data["detail"])
        self.assertEqual(self.estado(v, "FINALIZADO").status_code, 400)

    def test_confirmar_exige_vehiculo_y_principal(self):
        v = self.viaje()
        r = self.estado(v, "CONFIRMADO")
        self.assertEqual(len(r.data["motivos"]), 3)  # encabezado + vehículo + conductor
        self.poner_vehiculo(v)
        self.assertIn("conductor principal", self.estado(v, "CONFIRMADO").data["detail"])
        self.poner_conductor(v, rol="COPILOTO")
        self.assertEqual(self.estado(v, "CONFIRMADO").status_code, 400)  # el copiloto no basta

    def test_cancelar_exige_motivo_y_libera(self):
        v = self.listo()
        self.estado(v, "CONFIRMADO")
        self.estado(v, "EN_EMBARQUE")
        self.assertEqual(self.estado(v, "CANCELADO").status_code, 400)
        self.assertEqual(self.estado(v, "CANCELADO", "Falla mecánica").status_code, 200)
        self.vehiculo.refresh_from_db()
        self.assertEqual(self.vehiculo.estado, "DISPONIBLE")
        self.assertTrue(RegistroAuditoria.objects.filter(accion="CANCELAR", entidad="viaje").exists())

    def test_cancelar_viaje_anula_reservas_y_boletos_y_libera_asientos(self):
        v = self.viaje()
        pasajero = Passenger.objects.create(
            document_number="TEST-CANCEL-001",
            first_name="Pasajero",
            last_name="Demo",
        )
        reservas = []
        for seat_number, reservation_status, ticket_status in (
            (1, "CONFIRMED", "PAID"),
            (2, "PENDING", "RESERVED"),
        ):
            reserva = Reservation.objects.create(
                trip=v,
                total_amount=Decimal("25.00"),
                status=reservation_status,
            )
            ReservationSeat.objects.create(reservation=reserva, seat_number=seat_number)
            Ticket.objects.create(
                reservation=reserva,
                passenger=pasajero,
                seat_number=seat_number,
                price=Decimal("25.00"),
                status=ticket_status,
            )
            reservas.append(reserva)

        self.assertEqual(self.estado(v, "CANCELADO", "Falla mecánica").status_code, 200)

        for reserva in reservas:
            reserva.refresh_from_db()
            self.assertEqual(reserva.status, "CANCELLED")
            self.assertEqual(reserva.tickets.get().status, "CANCELLED")
        self.assertFalse(asientos_ocupados_por_viaje([v.pk]).get(v.pk))

    def test_revalida_al_embarcar(self):
        v = self.listo()
        self.estado(v, "CONFIRMADO")
        DocumentoVehicular.objects.filter(vehiculo=self.vehiculo).update(fecha_vencimiento=HOY - timedelta(days=1))
        r = self.estado(v, "EN_EMBARQUE")
        self.assertEqual(r.status_code, 400)
        self.assertIn("vence el", r.data["detail"])
        v.refresh_from_db()
        self.assertEqual(v.estado, "CONFIRMADO")
        self.vehiculo.refresh_from_db()
        self.assertEqual(self.vehiculo.estado, "DISPONIBLE")

    def test_licencia_vencida_impide_embarcar(self):
        v = self.listo()
        self.estado(v, "CONFIRMADO")
        Licencia.objects.filter(conductor=self.chofer).update(fecha_vencimiento=HOY - timedelta(days=1))
        self.assertEqual(self.estado(v, "EN_EMBARQUE").status_code, 400)

    def test_no_embarca_si_el_bus_sigue_en_otro_viaje(self):
        a = self.listo()
        self.estado(a, "CONFIRMADO")
        self.estado(a, "EN_EMBARQUE")
        b = self.viaje(en(80))
        self.poner_vehiculo(b)
        self.poner_conductor(b, self.chofer2)
        self.estado(b, "CONFIRMADO")
        r = self.estado(b, "EN_EMBARQUE")
        self.assertEqual(r.status_code, 400)
        self.assertIn("sigue en otro viaje", r.data["detail"])

    def test_viaje_finalizado_de_un_bus_no_libera_si_hay_otro_en_curso(self):
        # el bus pasa a DISPONIBLE solo cuando ningún viaje suyo sigue en curso
        a = self.listo()
        for e in ("CONFIRMADO", "EN_EMBARQUE", "EN_RUTA", "FINALIZADO"):
            self.estado(a, e)
        self.vehiculo.refresh_from_db()
        self.assertEqual(self.vehiculo.estado, "DISPONIBLE")


class PermisosTests(Base):
    def test_cajero_lee_pero_no_escribe(self):
        v = self.viaje()
        caja = cliente_api(CAJERO)
        self.assertEqual(caja.get("/api/viajes/").data["count"], 1)
        self.assertEqual(self.api("post", f"/api/viajes/{v.pk}/estado/", {"estado": "CANCELADO", "observacion": "x"}, caja).status_code, 403)
        self.assertEqual(self.api("post", "/api/viajes/generar/", {"desde": str(HOY), "hasta": str(HOY)}, caja).status_code, 403)

    def test_despachador_si_opera_y_conductor_solo_ve_los_suyos(self):
        v1, v2 = self.viaje(en(48)), self.viaje(en(100))
        desp = cliente_api(DESPACHADOR)
        self.assertEqual(self.api("post", f"/api/viajes/{v1.pk}/vehiculo/", {"vehiculo": self.vehiculo.pk}, desp).status_code, 200)
        u = User.objects.create_user("chofer_u", "c@e.pe", CLAVE)
        u.groups.add(Group.objects.get(name=CONDUCTOR))
        propio = self.nuevo_conductor("55555555", "USU", usuario=u)
        self.poner_conductor(v1, propio)
        c = APIClient()
        tok = c.post("/api/auth/login/", {"username": "chofer_u", "password": CLAVE}, format="json").data["access"]
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {tok}")
        lista = c.get("/api/viajes/").data["results"]
        self.assertEqual([x["id"] for x in lista], [v1.pk])
        self.assertEqual(c.get(f"/api/viajes/{v2.pk}/").status_code, 404)
        self.assertEqual(self.api("post", f"/api/viajes/{v1.pk}/estado/", {"estado": "CANCELADO", "observacion": "x"}, c).status_code, 403)
        self.assertEqual(self.api("post", "/api/viajes/", {}, c).status_code, 403)

    def test_filtros(self):
        a, b = self.viaje(en(48)), self.viaje(en(100))
        self.estado(a, "CANCELADO", "x")
        self.assertEqual(self.admin.get("/api/viajes/?estado=PROGRAMADO,CONFIRMADO").data["count"], 1)
        self.assertEqual(self.admin.get(f"/api/viajes/?fecha_desde={timezone.localdate(b.salida_programada)}&fecha_hasta={timezone.localdate(b.salida_programada)}").data["count"], 1)
        self.assertEqual(self.admin.get("/api/viajes/?search=AAA-111").data["count"], 0)

    def test_salida_desde_excludes_trips_that_have_already_departed(self):
        future = self.viaje(en(48))
        departed = self.viaje(en(1))
        departed.salida_programada = timezone.now() - timedelta(minutes=1)
        departed.save(update_fields=["salida_programada"])

        response = self.admin.get("/api/viajes/", {"salida_desde": timezone.now().isoformat()})

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([item["id"] for item in response.data["results"]], [future.pk])

class IncidenciaTests(Base):
    def setUp(self):
        super().setUp()
        self.u = User.objects.create_user("chofer_u", "c@e.pe", CLAVE)
        self.u.groups.add(Group.objects.get(name=CONDUCTOR))
        self.propio = self.nuevo_conductor("55555555", "USU", usuario=self.u)
        self.v = self.viaje()
        self.poner_vehiculo(self.v)
        self.poner_conductor(self.v, self.propio)
        self.estado(self.v, "CONFIRMADO")
        self.estado(self.v, "EN_EMBARQUE")
        self.estado(self.v, "EN_RUTA")
        self.cond = APIClient()
        tok = self.cond.post("/api/auth/login/", {"username": "chofer_u", "password": CLAVE}, format="json").data["access"]
        self.cond.credentials(HTTP_AUTHORIZATION=f"Bearer {tok}")

    def datos(self, **extra):
        return {"viaje": self.v.pk, "tipo": "MECANICA", "severidad": "ALTA", "descripcion": "Se calentó el motor", **extra}

    def test_conductor_registra_en_su_viaje(self):
        r = self.api("post", "/api/incidencias/", self.datos(), self.cond)
        self.assertEqual(r.status_code, 201, r.content)
        inc = Incidencia.objects.get()
        self.assertEqual((inc.registrada_por, inc.vehiculo), (self.u, self.vehiculo))
        self.assertTrue(RegistroAuditoria.objects.filter(entidad="incidencia", accion="CREAR").exists())
        self.assertEqual(len(self.cond.get("/api/incidencias/").data["results"]), 1)

    def test_no_en_viaje_ajeno_ni_sin_salir(self):
        ajeno = self.viaje(en(100))
        self.poner_vehiculo(ajeno, self.vehiculo2)
        self.poner_conductor(ajeno, self.chofer2)
        for e in ("CONFIRMADO", "EN_EMBARQUE", "EN_RUTA"):
            self.estado(ajeno, e)
        self.assertEqual(self.api("post", "/api/incidencias/", self.datos(viaje=ajeno.pk), self.cond).status_code, 403)
        programado = self.viaje(en(150))
        self.assertEqual(self.api("post", "/api/incidencias/", self.datos(viaje=programado.pk)).status_code, 400)  # aún no sale
        self.assertEqual(self.api("post", "/api/incidencias/", self.datos(descripcion="x")).status_code, 400)
        self.assertEqual(self.api("post", "/api/incidencias/", self.datos(ocurrida_en=en(5).isoformat())).status_code, 400)

    def test_solo_administracion_resuelve(self):
        pk = self.api("post", "/api/incidencias/", self.datos(), self.cond).data["id"]
        self.assertEqual(self.api("patch", f"/api/incidencias/{pk}/", {"resuelta": True, "resolucion": "ok"}, self.cond).status_code, 403)
        self.assertEqual(self.api("patch", f"/api/incidencias/{pk}/", {"resuelta": True}).status_code, 400)
        self.assertEqual(self.api("patch", f"/api/incidencias/{pk}/", {"descripcion": "cambiada"}).status_code, 400)
        r = self.api("patch", f"/api/incidencias/{pk}/", {"resuelta": True, "resolucion": "Se cambió el termostato"})
        self.assertEqual(r.status_code, 200)

    def test_cajero_sin_acceso(self):
        self.assertEqual(cliente_api(CAJERO).get("/api/incidencias/").status_code, 403)


class AlertasTests(Base):
    def test_alertas(self):
        DocumentoVehicular.objects.filter(vehiculo=self.vehiculo, tipo__codigo="SOAT").update(fecha_vencimiento=HOY + timedelta(days=5))
        DocumentoVehicular.objects.filter(vehiculo=self.vehiculo2, tipo__codigo="REV_TECNICA").update(fecha_vencimiento=HOY - timedelta(days=3))
        Licencia.objects.filter(conductor=self.chofer).update(fecha_vencimiento=HOY + timedelta(days=10))
        sin = Conductor.objects.create(dni="99999999", nombres="Sin", apellidos="Licencia")
        r = self.admin.get("/api/alertas/").data
        por = {(a["referencia"], a["detalle"]): a["situacion"] for a in r}
        self.assertEqual(por[("AAA-111", "SOAT")], "POR_VENCER")
        self.assertEqual(por[("BBB-222", "Revisión técnica")], "VENCIDO")
        self.assertEqual(por[(str(self.chofer), f"Licencia L11111111")], "POR_VENCER")
        self.assertEqual(por[(str(sin), "Licencia")], "SIN_REGISTRO")
        self.assertEqual(r[0]["situacion"], "VENCIDO")  # lo más grave primero
        self.assertEqual(cliente_api(CAJERO).get("/api/alertas/").status_code, 403)

    def test_documento_renovado_no_alerta(self):
        DocumentoVehicular.objects.filter(vehiculo=self.vehiculo, tipo__codigo="SOAT").update(
            fecha_emision=HOY - timedelta(days=400), fecha_vencimiento=HOY - timedelta(days=30))
        DocumentoVehicular.objects.create(vehiculo=self.vehiculo, tipo=TipoDocumentoVehicular.objects.get(codigo="SOAT"), numero="NUEVO",
                                          fecha_emision=HOY, fecha_vencimiento=HOY + timedelta(days=365))
        r = self.admin.get("/api/alertas/").data
        self.assertFalse([a for a in r if a["referencia"] == "AAA-111" and a["detalle"] == "SOAT"])


class ConcurrenciaTests(TransactionTestCase):
    """Comprueba que el bloqueo de filas evita asignaciones simultáneas incompatibles."""

    def test_un_solo_viaje_gana_el_bus(self):
        if not connection.features.has_select_for_update:
            self.skipTest("La base de datos no ofrece bloqueos de fila.")
        admin = User.objects.create_user("adm", "a@e.pe", CLAVE)
        ciudad_a, ciudad_b = Ciudad.objects.create(nombre="A", departamento="X"), Ciudad.objects.create(nombre="B", departamento="X")
        servicio = TipoServicio.objects.create(codigo="S", nombre="S")
        ruta = Ruta.objects.create(codigo="R", nombre="R", origen=ciudad_a, destino=ciudad_b, duracion_min=180)
        cfg = ConfiguracionAsientos.objects.create(nombre="c", pisos=1, total_asientos=1)
        bus = Vehiculo.objects.create(placa="CON-001", marca="m", modelo="m", anio=2022, configuracion_asientos=cfg, tipo_servicio=servicio)
        for t in TipoDocumentoVehicular.objects.filter(bloquea_asignacion=True):
            DocumentoVehicular.objects.create(vehiculo=bus, tipo=t, numero="N", fecha_emision=HOY, fecha_vencimiento=HOY + timedelta(days=400))
        base = en(48)
        viajes = [services.crear_viaje(ruta=ruta, tipo_servicio=servicio, salida_programada=base + timedelta(minutes=10 * i),
                                       precio_base=Decimal("10"), usuario=admin) for i in range(10)]  # todos se cruzan entre sí
        resultados, barrera = [], threading.Barrier(len(viajes))

        def intentar(v):
            try:
                barrera.wait()
                services.asignar_vehiculo(v.pk, bus.pk, admin)
                resultados.append("ok")
            except Exception as e:  # noqa: BLE001
                resultados.append(type(e).__name__)
            finally:
                connections.close_all()

        hilos = [threading.Thread(target=intentar, args=(v,)) for v in viajes]
        [h.start() for h in hilos]
        [h.join() for h in hilos]
        self.assertEqual(resultados.count("ok"), 1, resultados)
        self.assertEqual(Viaje.objects.filter(vehiculo=bus).count(), 1)
