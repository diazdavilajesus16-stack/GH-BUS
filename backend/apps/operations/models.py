from django.db import models

from apps.core.models import TimeStamped


class Configuracion(TimeStamped):
    """Parámetros del sistema editables sin desplegar código (decisión D7)."""

    clave = models.CharField(max_length=60, unique=True)
    valor = models.CharField(max_length=255)
    descripcion = models.CharField(max_length=255, blank=True)
    updated_by = models.ForeignKey("users.User", on_delete=models.PROTECT, null=True, blank=True, related_name="+")

    class Meta:
        db_table = "configuracion"
        ordering = ["clave"]
        verbose_name_plural = "configuración"

    def __str__(self):
        return f"{self.clave}={self.valor}"


class Incidencia(TimeStamped):
    class Tipo(models.TextChoices):
        MECANICA = "MECANICA", "Mecánica"
        RETRASO = "RETRASO", "Retraso"
        ACCIDENTE = "ACCIDENTE", "Accidente"
        CLIMA = "CLIMA", "Clima"
        PASAJERO = "PASAJERO", "Pasajero"
        OTRO = "OTRO", "Otro"

    class Severidad(models.TextChoices):
        BAJA = "BAJA", "Baja"
        MEDIA = "MEDIA", "Media"
        ALTA = "ALTA", "Alta"

    viaje = models.ForeignKey("trips.Viaje", on_delete=models.PROTECT, related_name="incidencias")
    vehiculo = models.ForeignKey("fleet.Vehiculo", on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    conductor = models.ForeignKey("drivers.Conductor", on_delete=models.PROTECT, null=True, blank=True, related_name="+")
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    severidad = models.CharField(max_length=6, choices=Severidad.choices, default=Severidad.BAJA)
    descripcion = models.TextField()
    ocurrida_en = models.DateTimeField()
    resuelta = models.BooleanField(default=False)
    resolucion = models.TextField(blank=True)
    registrada_por = models.ForeignKey("users.User", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "incidencia"
        ordering = ["-ocurrida_en"]
        indexes = [
            models.Index(fields=["viaje"], name="ix_incidencia_viaje"),
            models.Index(fields=["tipo", "ocurrida_en"], name="ix_incidencia_tipo_fecha"),
        ]
