from django.db import models
from django.db.models import F, Q

from apps.core.models import TimeStamped


class Conductor(TimeStamped):
    usuario = models.OneToOneField("users.User", on_delete=models.PROTECT, null=True, blank=True, related_name="conductor")
    dni = models.CharField(max_length=8, unique=True)
    nombres = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)
    telefono = models.CharField(max_length=20, blank=True)
    direccion = models.CharField(max_length=200, blank=True)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "conductor"
        ordering = ["apellidos", "nombres"]

    def __str__(self):
        return f"{self.apellidos}, {self.nombres}"


class Licencia(TimeStamped):
    class Categoria(models.TextChoices):
        A_I = "A-I", "A-I"
        A_IIA = "A-IIa", "A-IIa"
        A_IIB = "A-IIb", "A-IIb"
        A_IIIA = "A-IIIa", "A-IIIa"
        A_IIIB = "A-IIIb", "A-IIIb"
        A_IIIC = "A-IIIc", "A-IIIc"

    conductor = models.ForeignKey(Conductor, on_delete=models.PROTECT, related_name="licencias")
    numero = models.CharField(max_length=20, unique=True)
    categoria = models.CharField(max_length=8, choices=Categoria.choices)
    fecha_emision = models.DateField()
    fecha_vencimiento = models.DateField()
    activa = models.BooleanField(default=True)

    class Meta:
        db_table = "licencia"
        ordering = ["-fecha_vencimiento"]
        constraints = [
            models.CheckConstraint(condition=Q(fecha_vencimiento__gte=F("fecha_emision")), name="ck_licencia_fechas")
        ]
        indexes = [models.Index(fields=["conductor", "fecha_vencimiento"], name="ix_licencia_cond_venc")]


class TurnoConductor(TimeStamped):
    class Tipo(models.TextChoices):
        TURNO = "TURNO", "Turno"
        DESCANSO = "DESCANSO", "Descanso"
        VACACIONES = "VACACIONES", "Vacaciones"

    conductor = models.ForeignKey(Conductor, on_delete=models.PROTECT, related_name="turnos")
    tipo = models.CharField(max_length=12, choices=Tipo.choices)
    inicio = models.DateTimeField()
    fin = models.DateTimeField()
    observaciones = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "turno_conductor"
        ordering = ["-inicio"]
        constraints = [models.CheckConstraint(condition=Q(fin__gt=F("inicio")), name="ck_turno_fin_mayor_inicio")]
        indexes = [models.Index(fields=["conductor", "inicio", "fin"], name="ix_turno_cond_rango")]
