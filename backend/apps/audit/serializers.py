from rest_framework import serializers

from .models import RegistroAuditoria


class RegistroAuditoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegistroAuditoria
        fields = ["id", "creado_en", "accion", "entidad", "entidad_id", "usuario", "usuario_nombre",
                  "cambios", "ip", "user_agent"]
        read_only_fields = fields
