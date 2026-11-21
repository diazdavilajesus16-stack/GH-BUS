from django.db import models
from django.db.models import F, Q

from apps.core.models import TimeStamped


class Viaje(TimeStamped):
    class Estado(models.TextChoices):
        PROGRAMADO = "PROGRAMADO", "Programado"
        CONFIRMADO = "CONFIRMADO", "Confirmado"
        EN_EMBARQUE = "EN_EMBARQUE", "En embarque"
        EN_RUTA = "EN_RUTA", "En ruta"
        RETRASADO = "RETRASADO", "Retrasado"
        FINALIZADO = "FINALIZADO", "Finalizado"
        CANCELADO = "CANCELADO", "Cancelado"

    # Estados en los que el viaje ocupa al vehículo y a los conductores.
    ACTIVOS = ("PROGRAMADO", "CONFIRMADO", "EN_EMBARQUE", "EN_RUTA", "RETRASADO")

    codigo = models.CharField(max_length=20, unique=True)
    ruta = models.ForeignKey("routes.Ruta", on_delete=models.PROTECT, related_name="viajes")
    tipo_servicio = models.ForeignKey("routes.TipoServicio", on_delete=models.PROTECT, related_name="viajes")
    horario = models.ForeignKey("routes.Horario", on_delete=models.PROTECT, null=True, blank=True, related_name="viajes")
    salida_programada = models.DateTimeField()
    llegada_programada = models.DateTimeField()
    vehiculo = models.ForeignKey("fleet.Vehiculo", on_delete=models.PROTECT, null=True, blank=True, related_name="viajes")
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.PROGRAMADO)
    precio_base = models.DecimalField(max_digits=10, decimal_places=2)  # congelado al crear el viaje
    salida_real = models.DateTimeField(null=True, blank=True)
    llegada_real = models.DateTimeField(null=True, blank=True)
    observaciones = models.TextField(blank=True)
    creado_por = models.ForeignKey("users.User", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "viaje"
        ordering = ["salida_programada", "id"]
        constraints = [
            models.UniqueConstraint(fields=["horario", "salida_programada"], name="uq_viaje_horario_salida"),
            models.CheckConstraint(condition=Q(llegada_programada__gt=F("salida_programada")), name="ck_viaje_llegada_mayor_salida"),
            models.CheckConstraint(condition=Q(llegada_real__isnull=True) | Q(salida_real__isnull=False), name="ck_viaje_llegada_real_requiere_salida"),
            models.CheckConstraint(
                condition=~Q(estado__in=["EN_EMBARQUE", "EN_RUTA"]) | Q(vehiculo__isnull=False),
                name="ck_viaje_embarque_requiere_vehiculo",
            ),
            models.CheckConstraint(condition=Q(precio_base__gte=0), name="ck_viaje_precio_no_negativo"),
        ]
        indexes = [
            models.Index(fields=["estado", "salida_programada"], name="ix_viaje_estado_salida"),
            models.Index(fields=["ruta", "salida_programada"], name="ix_viaje_ruta_salida"),
            models.Index(fields=["vehiculo", "salida_programada", "llegada_programada"], name="ix_viaje_vehiculo_rango"),
        ]

    def __str__(self):
        return self.codigo


class AsignacionConductor(TimeStamped):
    class Rol(models.TextChoices):
        PRINCIPAL = "PRINCIPAL", "Principal"
        COPILOTO = "COPILOTO", "Copiloto"

    viaje = models.ForeignKey(Viaje, on_delete=models.PROTECT, related_name="asignaciones")
    conductor = models.ForeignKey("drivers.Conductor", on_delete=models.PROTECT, related_name="asignaciones")
    rol = models.CharField(max_length=10, choices=Rol.choices, default=Rol.PRINCIPAL)
    activa = models.BooleanField(default=True)
    asignado_por = models.ForeignKey("users.User", on_delete=models.PROTECT, related_name="+")
    asignado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "asignacion_conductor"
        ordering = ["viaje", "rol"]
        constraints = [models.UniqueConstraint(fields=["viaje", "conductor"], name="uq_asignacion_viaje_conductor")]
        indexes = [models.Index(fields=["conductor", "activa"], name="ix_asignacion_cond_activa")]


class ViajeEstadoHistorial(models.Model):
    viaje = models.ForeignKey(Viaje, on_delete=models.PROTECT, related_name="historial")
    estado_anterior = models.CharField(max_length=12, null=True, blank=True)
    estado_nuevo = models.CharField(max_length=12)
    cambiado_por = models.ForeignKey("users.User", on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    cambiado_en = models.DateTimeField(auto_now_add=True)
    observacion = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "viaje_estado_historial"
        ordering = ["cambiado_en", "id"]
        indexes = [models.Index(fields=["viaje", "cambiado_en"], name="ix_viaje_hist_viaje_fecha")]
