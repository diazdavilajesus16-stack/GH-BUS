from django.contrib import admin

from .models import RegistroAuditoria


@admin.register(RegistroAuditoria)
class RegistroAuditoriaAdmin(admin.ModelAdmin):
    """Solo lectura: la bitácora no se edita desde ningún lugar."""

    list_display = ("creado_en", "accion", "entidad", "entidad_id", "usuario_nombre", "ip")
    list_filter = ("accion", "entidad")
    search_fields = ("usuario_nombre", "entidad", "entidad_id", "ip")
    date_hierarchy = "creado_en"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
