from django.conf import settings
from django.db import models


class RegistroAuditoria(models.Model):
    """Bitácora de acciones. Solo se inserta: un registro nunca se modifica ni se borra."""

    class Accion(models.TextChoices):
        CREAR = "CREAR"
        MODIFICAR = "MODIFICAR"
        ELIMINAR = "ELIMINAR"
        CANCELAR = "CANCELAR"
        ANULAR = "ANULAR"
        LOGIN = "LOGIN"
        LOGIN_FALLIDO = "LOGIN_FALLIDO"
        LOGOUT = "LOGOUT"
        PERMISO_DENEGADO = "PERMISO_DENEGADO"
        CIERRE_CAJA = "CIERRE_CAJA"
        OTRO = "OTRO"

    # SET_NULL (excepción a la regla PROTECT): la bitácora debe sobrevivir a cualquier cambio de usuarios.
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    usuario_nombre = models.CharField(max_length=150, blank=True)  # copia por si el usuario cambia
    accion = models.CharField(max_length=20, choices=Accion.choices)
    entidad = models.CharField(max_length=60)
    entidad_id = models.CharField(max_length=40, null=True, blank=True)
    cambios = models.JSONField(null=True, blank=True)
    ip = models.CharField(max_length=45, null=True, blank=True)
    user_agent = models.CharField(max_length=255, null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "registro_auditoria"
        ordering = ["-creado_en", "-id"]
        indexes = [
            models.Index(fields=["entidad", "entidad_id"], name="ix_aud_entidad"),
            models.Index(fields=["usuario", "creado_en"], name="ix_aud_usuario"),
            models.Index(fields=["accion", "creado_en"], name="ix_aud_accion"),
            models.Index(fields=["creado_en"], name="ix_aud_fecha"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise PermissionError("Los registros de auditoría no se pueden modificar.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Los registros de auditoría no se pueden borrar.")

    def __str__(self):
        return f"{self.creado_en:%Y-%m-%d %H:%M:%S} {self.accion} {self.entidad}"
