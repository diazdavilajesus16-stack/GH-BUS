from django.db import migrations

ROLES = ["administrador", "despachador", "cajero", "conductor", "cliente"]


def crear_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for nombre in ROLES:
        Group.objects.using(schema_editor.connection.alias).get_or_create(name=nombre)


def quitar_roles(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    Group.objects.using(schema_editor.connection.alias).filter(name__in=ROLES).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0001_initial"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [migrations.RunPython(crear_roles, quitar_roles)]
