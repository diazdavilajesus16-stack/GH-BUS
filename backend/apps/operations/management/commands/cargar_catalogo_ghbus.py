"""Carga el catálogo de rutas y tarifas referenciales proporcionado para GH BUS."""
from datetime import date, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.routes.models import Ciudad, Horario, Ruta, Tarifa, TipoServicio


CIUDADES = [
    ("Moyobamba", "Moyobamba", "San Martín", ""),
    ("Nueva Cajamarca", "Rioja", "San Martín", ""),
    ("Tarapoto", "San Martín", "San Martín", ""),
    ("Juanjuí", "Mariscal Cáceres", "San Martín", ""),
    ("Bellavista", "Bellavista", "San Martín", ""),
    ("Picota", "Picota", "San Martín", ""),
    ("Tocache", "Tocache", "San Martín", ""),
    ("Chachapoyas", "Chachapoyas", "Amazonas", ""),
    ("Pedro Ruiz", "Bongará", "Amazonas", ""),
    ("Pomacochas", "Bongará", "Amazonas", ""),
    ("Rodríguez de Mendoza", "Rodríguez de Mendoza", "Amazonas", ""),
    ("Bagua Grande", "Utcubamba", "Amazonas", ""),
    ("Jaén", "Jaén", "Cajamarca", ""),
    ("Cajamarca", "Cajamarca", "Cajamarca", ""),
    ("Chiclayo", "Chiclayo", "Lambayeque", ""),
    ("Lambayeque", "Lambayeque", "Lambayeque", ""),
    ("Trujillo", "Trujillo", "La Libertad", ""),
    ("Chepén", "Chepén", "La Libertad", ""),
    ("Tingo María", "Leoncio Prado", "Huánuco", ""),
    ("Lima", "Lima", "Lima", "Agencia en La Victoria; dirección exacta pendiente."),
]

# Los rangos indicados se guardan usando su promedio: 7–8 h = 7 h 30 min,
# 8–10 h = 9 h y 17–21 h = 19 h.
RUTAS = [
    ("MOY-TAR", "Moyobamba - Tarapoto", "Moyobamba", "Tarapoto", 120, "32.00"),
    ("TAR-CHA", "Tarapoto - Chachapoyas", "Tarapoto", "Chachapoyas", 450, "40.00"),
    ("CHI-MOY", "Chiclayo - Moyobamba", "Chiclayo", "Moyobamba", 780, "70.00"),
    ("TAR-CHI", "Tarapoto - Chiclayo", "Tarapoto", "Chiclayo", 960, "70.00"),
    ("JAE-TAR", "Jaén - Tarapoto", "Jaén", "Tarapoto", 540, "70.00"),
    ("MOY-CHI", "Moyobamba - Chiclayo", "Moyobamba", "Chiclayo", 945, "80.00"),
    ("LIM-JAE", "Lima - Jaén", "Lima", "Jaén", 1140, "110.00"),
    ("TAR-TRU", "Tarapoto - Trujillo", "Tarapoto", "Trujillo", 1200, "120.00"),
    ("TAR-LIM", "Tarapoto - Lima", "Tarapoto", "Lima", 1380, "150.00"),
]

SERVICIOS = [
    ("BUS_CAMA", "Bus Cama (Cama 180°)", "Asientos que se reclinan casi por completo; recomendado para viajes largos."),
    ("SEMI_CAMA", "Semi-Cama (Cama 140°)", "Reclinación aproximada de 140 grados; equilibrio entre precio y comodidad."),
    (
        "EJECUTIVO_PREMIUM",
        "Ejecutivo / Premium",
        "Más espacio entre filas, Wi-Fi, cargadores USB y servicio a bordo (snacks y bebidas).",
    ),
    (
        "ESTANDAR_ECONOMICO",
        "Servicio Estándar / Económico",
        "Servicio regular sin lujos y opción económica para rutas cortas.",
    ),
    (
        "VIP_ROYAL",
        "VIP / Royal",
        "Para rutas muy largas; puede incluir asientos individuales, pantallas personales o servicio de cena.",
    ),
]


class Command(BaseCommand):
    help = "Carga las localidades, rutas de ida y precios referenciales proporcionados para GH BUS."

    def add_arguments(self, parser):
        parser.add_argument("--forzar", action="store_true", help="Permite ejecutarlo con DEBUG=False.")

    @transaction.atomic
    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["forzar"]:
            raise CommandError("Carga de catálogo protegida. Usa --forzar si estás seguro.")

        hoy = date.today()
        ciudades = {}
        for nombre, provincia, departamento, observaciones in CIUDADES:
            ciudad, _ = Ciudad.objects.update_or_create(
                nombre=nombre,
                departamento=departamento,
                defaults={
                    "provincia": provincia,
                    "observaciones": observaciones,
                    "activa": True,
                },
            )
            ciudades[nombre] = ciudad

        Ciudad.objects.filter(nombre="Rioja", departamento="San Martín").update(activa=False)

        Horario.objects.filter(ruta__codigo__startswith="DEMO-").update(activo=False)
        Ruta.objects.filter(codigo__startswith="DEMO-").update(activa=False)

        ruta_demo = Ruta.objects.filter(codigo="DEMO-MOY-TAR").first()
        if ruta_demo and not Ruta.objects.filter(codigo="MOY-TAR").exists():
            ruta_demo.codigo = "MOY-TAR"
            ruta_demo.save(update_fields=["codigo", "updated_at"])
        Tarifa.objects.filter(ruta__codigo__startswith="DEMO-").update(activa=False)

        servicios = {}
        for codigo, nombre, descripcion in SERVICIOS:
            servicio, _ = TipoServicio.objects.update_or_create(
                codigo=codigo,
                defaults={"nombre": nombre, "descripcion": descripcion, "activo": True},
            )
            servicios[codigo] = servicio

        comfort = TipoServicio.objects.filter(codigo="COMFORT").first()
        if comfort:
            tarifas_comfort = Tarifa.objects.filter(tipo_servicio=comfort, activa=True)
            tarifas_comfort.filter(vigente_desde__lt=hoy).filter(
                Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=hoy)
            ).update(vigente_hasta=hoy - timedelta(days=1))
            tarifas_comfort.filter(vigente_desde=hoy).filter(
                Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=hoy)
            ).update(vigente_hasta=hoy)
            tarifas_comfort.update(activa=False)
            comfort.activo = False
            comfort.save(update_fields=["activo", "updated_at"])

        servicio = servicios["ESTANDAR_ECONOMICO"]
        for codigo, nombre, origen, destino, duracion_min, monto in RUTAS:
            ruta, _ = Ruta.objects.update_or_create(
                codigo=codigo,
                defaults={
                    "nombre": nombre,
                    "origen": ciudades[origen],
                    "destino": ciudades[destino],
                    "duracion_min": duracion_min,
                    "activa": True,
                },
            )
            tarifas_anteriores = Tarifa.objects.filter(
                ruta=ruta,
                tipo_servicio=servicio,
                activa=True,
                vigente_desde__lt=hoy,
            )
            tarifas_anteriores.filter(
                Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=hoy)
            ).update(
                vigente_hasta=hoy - timedelta(days=1),
            )
            tarifas_anteriores.update(activa=False)
            Tarifa.objects.update_or_create(
                ruta=ruta,
                tipo_servicio=servicio,
                vigente_desde=hoy,
                defaults={"monto": monto, "vigente_hasta": None, "activa": True},
            )

        self.stdout.write(self.style.SUCCESS(
            f"Catálogo cargado: {len(CIUDADES)} localidades y {len(RUTAS)} rutas de ida."
        ))
        self.stdout.write(
            "Las tarifas referenciales se asignaron a Estándar/Económico. Los otros servicios requieren sus propias tarifas."
        )
        self.stdout.write(
            "Los precios y duraciones son referenciales. No se crearon horarios porque no se proporcionaron horas de salida."
        )
