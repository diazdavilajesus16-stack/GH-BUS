from django.db import models
from django.db.models import F, Q

from apps.core.models import TimeStamped
from apps.routes.models import TipoServicio


class ConfiguracionAsientos(TimeStamped):
    """Distribución de asientos de un modelo de bus. Una vez creada no se edita (los viajes copian de ella)."""

    nombre = models.CharField(max_length=80, unique=True)
    pisos = models.PositiveSmallIntegerField()
    total_asientos = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "configuracion_asientos"
        ordering = ["nombre"]
        verbose_name_plural = "configuraciones de asientos"

    def __str__(self):
        return f"{self.nombre} ({self.total_asientos} asientos)"


class AsientoPlantilla(TimeStamped):
    class Categoria(models.TextChoices):
        VENTANA = "VENTANA", "Ventana"
        PASILLO = "PASILLO", "Pasillo"
        ESPECIAL = "ESPECIAL", "Especial"

    configuracion = models.ForeignKey(ConfiguracionAsientos, on_delete=models.PROTECT, related_name="asientos")
    numero = models.PositiveSmallIntegerField()
    piso = models.PositiveSmallIntegerField()
    fila = models.PositiveSmallIntegerField()
    columna = models.PositiveSmallIntegerField()
    categoria = models.CharField(max_length=10, choices=Categoria.choices, null=True, blank=True)

    class Meta:
        db_table = "asiento_plantilla"
        ordering = ["configuracion", "numero"]
        constraints = [
            models.UniqueConstraint(fields=["configuracion", "numero"], name="uq_asiento_plantilla_numero"),
            models.UniqueConstraint(
                fields=["configuracion", "piso", "fila", "columna"], name="uq_asiento_plantilla_posicion"
            ),
        ]


class Vehiculo(TimeStamped):
    class Estado(models.TextChoices):
        DISPONIBLE = "DISPONIBLE", "Disponible"
        EN_VIAJE = "EN_VIAJE", "En viaje"
        MANTENIMIENTO = "MANTENIMIENTO", "En mantenimiento"
        FUERA_DE_SERVICIO = "FUERA_DE_SERVICIO", "Fuera de servicio"

    placa = models.CharField(max_length=10, unique=True)
    marca = models.CharField(max_length=60)
    modelo = models.CharField(max_length=60)
    anio = models.PositiveSmallIntegerField()
    configuracion_asientos = models.ForeignKey(ConfiguracionAsientos, on_delete=models.PROTECT, related_name="vehiculos")
    tipo_servicio = models.ForeignKey(TipoServicio, on_delete=models.PROTECT, related_name="vehiculos")
    caracteristicas = models.JSONField(null=True, blank=True)
    kilometraje = models.PositiveIntegerField(null=True, blank=True)
    estado = models.CharField(max_length=20, choices=Estado.choices, default=Estado.DISPONIBLE)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "vehiculo"
        ordering = ["placa"]
        indexes = [models.Index(fields=["estado"], name="ix_vehiculo_estado")]

    def __str__(self):
        return self.placa


class TipoDocumentoVehicular(TimeStamped):
    codigo = models.CharField(max_length=30, unique=True)
    nombre = models.CharField(max_length=80)
    bloquea_asignacion = models.BooleanField(default=False)
    dias_alerta = models.PositiveSmallIntegerField(default=30)

    class Meta:
        db_table = "tipo_documento_vehicular"
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class DocumentoVehicular(TimeStamped):
    vehiculo = models.ForeignKey(Vehiculo, on_delete=models.PROTECT, related_name="documentos")
    tipo = models.ForeignKey(TipoDocumentoVehicular, on_delete=models.PROTECT, related_name="documentos")
    numero = models.CharField(max_length=60)
    fecha_emision = models.DateField()
    fecha_vencimiento = models.DateField()

    class Meta:
        db_table = "documento_vehicular"
        ordering = ["fecha_vencimiento"]
        constraints = [
            models.CheckConstraint(
                condition=Q(fecha_vencimiento__gte=F("fecha_emision")), name="ck_documento_vehicular_fechas"
            )
        ]
        indexes = [
            models.Index(fields=["vehiculo", "tipo", "fecha_vencimiento"], name="ix_docveh_vehiculo_tipo_venc"),
            models.Index(fields=["fecha_vencimiento"], name="ix_docveh_vencimiento"),
        ]


class Mantenimiento(TimeStamped):
    class Tipo(models.TextChoices):
        PREVENTIVO = "PREVENTIVO", "Preventivo"
        CORRECTIVO = "CORRECTIVO", "Correctivo"

    class Estado(models.TextChoices):
        PROGRAMADO = "PROGRAMADO", "Programado"
        EN_PROCESO = "EN_PROCESO", "En proceso"
        COMPLETADO = "COMPLETADO", "Completado"
        CANCELADO = "CANCELADO", "Cancelado"

    vehiculo = models.ForeignKey(Vehiculo, on_delete=models.PROTECT, related_name="mantenimientos")
    tipo = models.CharField(max_length=12, choices=Tipo.choices)
    estado = models.CharField(max_length=12, choices=Estado.choices, default=Estado.PROGRAMADO)
    descripcion = models.CharField(max_length=255)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField(null=True, blank=True)
    kilometraje = models.PositiveIntegerField(null=True, blank=True)
    costo = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    proveedor = models.CharField(max_length=120, blank=True)
    registrado_por = models.ForeignKey("users.User", on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "mantenimiento"
        ordering = ["-fecha_inicio"]
        constraints = [
            models.CheckConstraint(
                condition=Q(fecha_fin__isnull=True) | Q(fecha_fin__gte=F("fecha_inicio")),
                name="ck_mantenimiento_fechas",
            )
        ]
        indexes = [models.Index(fields=["vehiculo", "fecha_inicio"], name="ix_mant_vehiculo_inicio")]
