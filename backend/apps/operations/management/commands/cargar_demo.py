"""Datos ILUSTRATIVOS para probar las pantallas. NO son datos reales de la empresa.

Uso:  python manage.py cargar_demo
Los nombres de ciudades son reales; duraciones, distancias, precios y la flota son inventados.
Es idempotente (se puede repetir) y se niega a correr con DEBUG=False salvo con --forzar.
"""
from datetime import date

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.fleet.models import AsientoPlantilla, ConfiguracionAsientos, Vehiculo
from apps.routes.models import Ciudad, Horario, Ruta, Tarifa, TipoServicio


class Command(BaseCommand):
    help = "Carga datos ilustrativos (DEMO) de rutas, tarifas, horarios y un bus."

    def add_arguments(self, parser):
        parser.add_argument("--forzar", action="store_true", help="Permite ejecutarlo con DEBUG=False")

    @transaction.atomic
    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["forzar"]:
            raise CommandError("Datos DEMO: solo en desarrollo (DEBUG=True). Usa --forzar si estás seguro.")
        c = {n: Ciudad.objects.get_or_create(nombre=n, departamento="San Martín")[0]
             for n in ("Moyobamba", "Rioja", "Tarapoto")}
        servicio, _ = TipoServicio.objects.get_or_create(
            codigo="COMFORT", defaults={"nombre": "Comfort Class", "descripcion": "DEMO"})
        for codigo, nombre, o, d, km, minutos, monto in [
            ("DEMO-MOY-TAR", "Moyobamba - Tarapoto (DEMO)", "Moyobamba", "Tarapoto", "110.0", 150, "25.00"),
            ("DEMO-TAR-MOY", "Tarapoto - Moyobamba (DEMO)", "Tarapoto", "Moyobamba", "110.0", 150, "25.00"),
        ]:
            ruta, _ = Ruta.objects.get_or_create(codigo=codigo, defaults=dict(
                nombre=nombre, origen=c[o], destino=c[d], distancia_km=km, duracion_min=minutos))
            Tarifa.objects.get_or_create(ruta=ruta, tipo_servicio=servicio, vigente_desde=date(2026, 1, 1),
                                         defaults={"monto": monto})
            Horario.objects.get_or_create(ruta=ruta, tipo_servicio=servicio, hora_salida="08:00",
                                          vigente_desde=date(2026, 1, 1))
        cfg, creada = ConfiguracionAsientos.objects.get_or_create(
            nombre="Bus 1 piso (DEMO)", defaults={"pisos": 1, "total_asientos": 40})
        if creada:
            AsientoPlantilla.objects.bulk_create([
                AsientoPlantilla(configuracion=cfg, numero=(f - 1) * 4 + col, piso=1, fila=f, columna=col,
                                 categoria="VENTANA" if col in (1, 4) else "PASILLO")
                for f in range(1, 11) for col in range(1, 5)])
        Vehiculo.objects.get_or_create(placa="DEMO-001", defaults=dict(
            marca="DEMO", modelo="DEMO", anio=2024, configuracion_asientos=cfg, tipo_servicio=servicio))
        self.stdout.write(self.style.WARNING("Datos DEMO cargados (ilustrativos, no reales)."))
