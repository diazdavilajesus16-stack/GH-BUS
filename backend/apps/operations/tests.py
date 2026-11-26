from datetime import date, time, timedelta
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.fleet.models import Vehiculo
from apps.routes.models import Ciudad, Horario, Ruta, Tarifa, TipoServicio


class CargarCatalogoGHBUSTests(TestCase):
    def setUp(self):
        self.moyobamba = Ciudad.objects.create(nombre="Moyobamba", departamento="San Martín")
        self.tarapoto = Ciudad.objects.create(nombre="Tarapoto", departamento="San Martín")
        self.rioja = Ciudad.objects.create(nombre="Rioja", departamento="San Martín")
        self.servicio = TipoServicio.objects.create(codigo="COMFORT", nombre="Comfort Class", descripcion="DEMO")
        self.ruta_demo = Ruta.objects.create(
            codigo="DEMO-MOY-TAR",
            nombre="Moyobamba - Tarapoto (DEMO)",
            origen=self.moyobamba,
            destino=self.tarapoto,
            duracion_min=150,
        )
        self.ruta_vuelta_demo = Ruta.objects.create(
            codigo="DEMO-TAR-MOY",
            nombre="Tarapoto - Moyobamba (DEMO)",
            origen=self.tarapoto,
            destino=self.moyobamba,
            duracion_min=150,
        )
        ayer = date.today() - timedelta(days=1)
        self.tarifa_anterior = Tarifa.objects.create(
            ruta=self.ruta_demo,
            tipo_servicio=self.servicio,
            monto=Decimal("25.00"),
            vigente_desde=ayer - timedelta(days=30),
        )
        self.tarifa_vencida_activa = Tarifa.objects.create(
            ruta=self.ruta_demo,
            tipo_servicio=self.servicio,
            monto=Decimal("24.00"),
            vigente_desde=ayer - timedelta(days=60),
            vigente_hasta=ayer - timedelta(days=31),
        )
        self.tarifa_vuelta_demo = Tarifa.objects.create(
            ruta=self.ruta_vuelta_demo,
            tipo_servicio=self.servicio,
            monto=Decimal("25.00"),
            vigente_desde=ayer - timedelta(days=30),
        )
        self.horario_demo = Horario.objects.create(
            ruta=self.ruta_demo,
            tipo_servicio=self.servicio,
            hora_salida=time(8),
            vigente_desde=ayer - timedelta(days=30),
        )

    def test_loads_real_catalog_idempotently_and_deactivates_demo_schedule(self):
        call_command("cargar_catalogo_ghbus", forzar=True, stdout=StringIO())
        call_command("cargar_catalogo_ghbus", forzar=True, stdout=StringIO())

        self.ruta_demo.refresh_from_db()
        self.ruta_vuelta_demo.refresh_from_db()
        self.tarifa_anterior.refresh_from_db()
        self.tarifa_vencida_activa.refresh_from_db()
        self.tarifa_vuelta_demo.refresh_from_db()
        self.horario_demo.refresh_from_db()

        self.assertEqual(self.ruta_demo.codigo, "MOY-TAR")
        self.assertEqual(self.ruta_demo.duracion_min, 120)
        self.assertTrue(self.ruta_demo.activa)
        self.assertFalse(self.ruta_vuelta_demo.activa)
        self.assertFalse(self.tarifa_vuelta_demo.activa)
        self.assertFalse(self.horario_demo.activo)
        self.assertEqual(self.tarifa_anterior.vigente_hasta, date.today() - timedelta(days=1))
        self.assertFalse(self.tarifa_anterior.activa)
        self.assertFalse(self.tarifa_vencida_activa.activa)
        self.assertEqual(Ciudad.objects.filter(activa=True).count(), 20)
        self.rioja.refresh_from_db()
        self.assertFalse(self.rioja.activa)
        self.assertEqual(Ruta.objects.filter(activa=True).count(), 9)
        self.assertEqual(Ruta.objects.get(codigo="TAR-CHA").duracion_min, 450)
        estandar = TipoServicio.objects.get(codigo="ESTANDAR_ECONOMICO")
        self.assertEqual(
            Tarifa.objects.get(ruta=self.ruta_demo, tipo_servicio=estandar, vigente_desde=date.today()).monto,
            Decimal("32.00"),
        )
        self.servicio.refresh_from_db()
        self.assertFalse(self.servicio.activo)
        self.assertSetEqual(
            set(TipoServicio.objects.filter(activo=True).values_list("codigo", flat=True)),
            {"BUS_CAMA", "SEMI_CAMA", "EJECUTIVO_PREMIUM", "ESTANDAR_ECONOMICO", "VIP_ROYAL"},
        )
        self.assertEqual(Tarifa.objects.filter(activa=True).count(), 9)
        self.assertFalse(
            Tarifa.objects.filter(activa=True).exclude(tipo_servicio=estandar).exists()
        )

        lima = Ciudad.objects.get(nombre="Lima", departamento="Lima")
        self.assertEqual(lima.provincia, "Lima")
        self.assertIn("La Victoria", lima.observaciones)
        self.assertFalse(Horario.objects.filter(activo=True).exists())

    def test_demo_command_keeps_only_the_demo_vehicle_asset(self):
        call_command("cargar_demo", forzar=True, stdout=StringIO())

        self.assertTrue(Vehiculo.objects.filter(placa="DEMO-001").exists())
        self.assertEqual(
            Vehiculo.objects.get(placa="DEMO-001").tipo_servicio.codigo,
            "ESTANDAR_ECONOMICO",
        )
        self.assertEqual(Ruta.objects.filter(activa=True).count(), 9)
        self.assertFalse(Horario.objects.filter(activo=True).exists())
