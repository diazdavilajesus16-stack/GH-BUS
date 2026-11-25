import decimal

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0001_initial"),
        ("trips", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="TripSettlement",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("DRAFT", "En proceso"), ("CLOSED", "Liquidada")],
                        default="DRAFT",
                        max_length=10,
                    ),
                ),
                ("income_snapshot", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("expense_snapshot", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("net_snapshot", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "closed_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="trip_settlements_closed",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "trip",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="settlement",
                        to="trips.viaje",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="TripExpense",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("FUEL", "Combustible"),
                            ("TOLL", "Peaje"),
                            ("PER_DIEM", "Viáticos"),
                            ("OTHER", "Otro"),
                        ],
                        max_length=10,
                    ),
                ),
                (
                    "amount",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=12,
                        validators=[django.core.validators.MinValueValidator(decimal.Decimal("0.01"))],
                    ),
                ),
                ("description", models.CharField(max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="trip_expenses",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "settlement",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="expenses",
                        to="finance.tripsettlement",
                    ),
                ),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
