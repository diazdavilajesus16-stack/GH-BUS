from django.db import migrations

# docs/database.md §7. Son valores iniciales: la empresa debe confirmarlos (ver README).
VALORES = [
    ("bloqueo_asiento_minutos", "10", "Minutos que se mantiene bloqueado un asiento mientras se paga"),
    ("margen_entre_viajes_min", "60", "Margen mínimo entre dos viajes del mismo vehículo o conductor (minutos)"),
    ("descanso_minimo_conductor_horas", "8", "Descanso mínimo del conductor entre viajes (horas)"),
    ("categorias_licencia_permitidas", "A-IIIa,A-IIIb,A-IIIc", "Categorías de licencia válidas para conducir buses (verificar con el MTC)"),
    ("igv_porcentaje", "18", "IGV (%)"),
    ("dias_alerta_documentos", "30", "Días de anticipación para alertar vencimientos de documentos"),
    ("politica_cancelacion", "", "Política de cancelación y reembolso (a definir con la empresa)"),
]


def crear(apps, schema_editor):
    Configuracion = apps.get_model("operations", "Configuracion")
    for clave, valor, descripcion in VALORES:
        Configuracion.objects.get_or_create(clave=clave, defaults={"valor": valor, "descripcion": descripcion})


class Migration(migrations.Migration):
    dependencies = [("operations", "0001_initial")]
    operations = [migrations.RunPython(crear, migrations.RunPython.noop)]
