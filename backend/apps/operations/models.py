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
