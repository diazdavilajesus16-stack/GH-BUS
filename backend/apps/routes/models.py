from django.db import models
from django.db.models import F, Q

from apps.core.models import TimeStamped

# Días de la semana como máscara de bits: lunes=1, martes=2, miércoles=4, jueves=8, viernes=16, sábado=32, domingo=64.
DIAS = [(1, "Lun"), (2, "Mar"), (4, "Mié"), (8, "Jue"), (16, "Vie"), (32, "Sáb"), (64, "Dom")]
TODOS_LOS_DIAS = 127


class Ciudad(TimeStamped):
    nombre = models.CharField(max_length=80)
    departamento = models.CharField(max_length=80)
    activa = models.BooleanField(default=True)

    class Meta:
        db_table = "ciudad"
        ordering = ["nombre"]
        verbose_name_plural = "ciudades"
        constraints = [models.UniqueConstraint(fields=["nombre", "departamento"], name="uq_ciudad_nombre_depto")]

    def __str__(self):
        return f"{self.nombre} ({self.departamento})"


class TipoServicio(TimeStamped):
    """Clase de servicio, p. ej. «Comfort Class»."""

    codigo = models.CharField(max_length=20, unique=True)
    nombre = models.CharField(max_length=80)
    descripcion = models.CharField(max_length=255, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "tipo_servicio"
        ordering = ["nombre"]
        verbose_name_plural = "tipos de servicio"

    def __str__(self):
        return self.nombre


class Ruta(TimeStamped):
    codigo = models.CharField(max_length=20, unique=True)
    nombre = models.CharField(max_length=120)
    origen = models.ForeignKey(Ciudad, on_delete=models.PROTECT, related_name="rutas_origen")
    destino = models.ForeignKey(Ciudad, on_delete=models.PROTECT, related_name="rutas_destino")
    distancia_km = models.DecimalField(max_digits=7, decimal_places=1, null=True, blank=True)
    duracion_min = models.PositiveIntegerField()
    activa = models.BooleanField(default=True)

    class Meta:
        db_table = "ruta"
        ordering = ["codigo"]
        constraints = [
            models.CheckConstraint(condition=~Q(origen=F("destino")), name="ck_ruta_origen_distinto_destino"),
            models.CheckConstraint(condition=Q(duracion_min__gt=0), name="ck_ruta_duracion_positiva"),
        ]

    def __str__(self):
        return f"{self.codigo} · {self.nombre}"


class Parada(TimeStamped):
    """Parada intermedia (informativa: el asiento se vende para el viaje completo, decisión D2)."""

    ruta = models.ForeignKey(Ruta, on_delete=models.PROTECT, related_name="paradas")
    ciudad = models.ForeignKey(Ciudad, on_delete=models.PROTECT, related_name="+")
    orden = models.PositiveSmallIntegerField()
    minutos_desde_origen = models.PositiveIntegerField()
    direccion = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "parada"
        ordering = ["ruta", "orden"]
        constraints = [
            models.UniqueConstraint(fields=["ruta", "orden"], name="uq_parada_ruta_orden"),
            models.UniqueConstraint(fields=["ruta", "ciudad"], name="uq_parada_ruta_ciudad"),
        ]


class Tarifa(TimeStamped):
    ruta = models.ForeignKey(Ruta, on_delete=models.PROTECT, related_name="tarifas")
    tipo_servicio = models.ForeignKey(TipoServicio, on_delete=models.PROTECT, related_name="tarifas")
    monto = models.DecimalField(max_digits=10, decimal_places=2)  # soles, IGV incluido
    vigente_desde = models.DateField()
    vigente_hasta = models.DateField(null=True, blank=True)
    activa = models.BooleanField(default=True)

    class Meta:
        db_table = "tarifa"
        ordering = ["ruta", "tipo_servicio", "-vigente_desde"]
        constraints = [
            models.UniqueConstraint(fields=["ruta", "tipo_servicio", "vigente_desde"], name="uq_tarifa_vigencia"),
            models.CheckConstraint(condition=Q(monto__gt=0), name="ck_tarifa_monto_positivo"),
            models.CheckConstraint(
                condition=Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=F("vigente_desde")),
                name="ck_tarifa_vigencia_valida",
            ),
        ]


class Horario(TimeStamped):
    """Plantilla de salida recurrente. De aquí se generarán los viajes (siguiente sub-paso)."""

    ruta = models.ForeignKey(Ruta, on_delete=models.PROTECT, related_name="horarios")
    tipo_servicio = models.ForeignKey(TipoServicio, on_delete=models.PROTECT, related_name="horarios")
    hora_salida = models.TimeField()
    dias_semana = models.PositiveSmallIntegerField(default=TODOS_LOS_DIAS)
    vigente_desde = models.DateField()
    vigente_hasta = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "horario"
        ordering = ["ruta", "hora_salida"]
        constraints = [
            models.UniqueConstraint(
                fields=["ruta", "tipo_servicio", "hora_salida", "vigente_desde"], name="uq_horario_salida"
            ),
            models.CheckConstraint(condition=Q(dias_semana__gte=1, dias_semana__lte=127), name="ck_horario_dias"),
            models.CheckConstraint(
                condition=Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=F("vigente_desde")),
                name="ck_horario_vigencia_valida",
            ),
        ]
