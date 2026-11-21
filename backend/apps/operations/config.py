"""Lectura de parámetros de la tabla `configuracion` con valores de respaldo."""
from .models import Configuracion

RESPALDO = {
    "bloqueo_asiento_minutos": "10",
    "margen_entre_viajes_min": "60",
    "descanso_minimo_conductor_horas": "8",
    "categorias_licencia_permitidas": "A-IIIa,A-IIIb,A-IIIc",
    "igv_porcentaje": "18",
    "dias_alerta_documentos": "30",
    "politica_cancelacion": "",
}
ENTEROS = {
    "bloqueo_asiento_minutos": (1, 120),
    "margen_entre_viajes_min": (0, 1440),
    "descanso_minimo_conductor_horas": (0, 48),
    "igv_porcentaje": (0, 100),
    "dias_alerta_documentos": (0, 365),
}


def valor(clave: str) -> str:
    fila = Configuracion.objects.filter(clave=clave).values_list("valor", flat=True).first()
    return fila if fila is not None else RESPALDO[clave]


def entero(clave: str) -> int:
    return int(valor(clave))


def categorias_licencia_permitidas() -> set[str]:
    return {c.strip() for c in valor("categorias_licencia_permitidas").split(",") if c.strip()}
