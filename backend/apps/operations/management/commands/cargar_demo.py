"""Carga el catálogo GH BUS y activos ilustrativos para pruebas locales."""

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.fleet.models import AsientoPlantilla, ConfiguracionAsientos, Vehiculo
from apps.routes.models import TipoServicio


class Command(BaseCommand):
    help = "Carga el catálogo GH BUS y un bus/plantilla de asientos ilustrativos."

    def add_arguments(self, parser):
        parser.add_argument("--forzar", action="store_true", help="Permite ejecutarlo con DEBUG=False")

    @transaction.atomic
    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["forzar"]:
            raise CommandError("Datos DEMO: solo en desarrollo (DEBUG=True). Usa --forzar si estás seguro.")
        call_command("cargar_catalogo_ghbus", forzar=opts["forzar"])
        servicio = TipoServicio.objects.get(codigo="ESTANDAR_ECONOMICO")
        cfg, creada = ConfiguracionAsientos.objects.get_or_create(
            nombre="Bus 1 piso (DEMO)", defaults={"pisos": 1, "total_asientos": 40})
        if creada:
            AsientoPlantilla.objects.bulk_create([
                AsientoPlantilla(configuracion=cfg, numero=(f - 1) * 4 + col, piso=1, fila=f, columna=col,
                                 categoria="VENTANA" if col in (1, 4) else "PASILLO")
                for f in range(1, 11) for col in range(1, 5)])
        Vehiculo.objects.update_or_create(
            placa="DEMO-001",
            defaults=dict(marca="DEMO", modelo="DEMO", anio=2024, configuracion_asientos=cfg, tipo_servicio=servicio),
        )
        self.stdout.write(self.style.WARNING(
            "Catálogo GH BUS cargado. La plantilla y el vehículo DEMO-001 son activos ilustrativos."
        ))
