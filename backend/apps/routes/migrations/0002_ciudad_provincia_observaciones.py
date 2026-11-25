from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("routes", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="ciudad",
            name="provincia",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
        migrations.AddField(
            model_name="ciudad",
            name="observaciones",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
