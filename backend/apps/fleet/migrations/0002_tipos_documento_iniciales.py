from django.db import migrations

# docs/database.md §7: SOAT y Revisión técnica bloquean la asignación; el resto solo alerta.
TIPOS = [
    ("SOAT", "SOAT", True),
    ("REV_TECNICA", "Revisión técnica", True),
    ("TARJETA_PROPIEDAD", "Tarjeta de propiedad", False),
    ("POLIZA", "Póliza de seguro", False),
    ("PERMISO_OPERACION", "Permiso de operación", False),
]


def crear(apps, schema_editor):
    Tipo = apps.get_model("fleet", "TipoDocumentoVehicular")
    for codigo, nombre, bloquea in TIPOS:
        Tipo.objects.get_or_create(codigo=codigo, defaults={"nombre": nombre, "bloquea_asignacion": bloquea})


class Migration(migrations.Migration):
    dependencies = [("fleet", "0001_initial")]
    operations = [migrations.RunPython(crear, migrations.RunPython.noop)]
