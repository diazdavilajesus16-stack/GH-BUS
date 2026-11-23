from rest_framework import status
from rest_framework.exceptions import APIException


class ReglaNoCumplida(APIException):
    """No se cumple una regla de negocio (400). `motivos` lista todo lo que falla, para corregirlo de una vez."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "regla_no_cumplida"

    def __init__(self, motivos):
        motivos = [motivos] if isinstance(motivos, str) else list(motivos)
        super().__init__({"detail": " ".join(motivos), "motivos": motivos})


class Conflicto(APIException):
    """El recurso ya está comprometido con otro viaje (409)."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "conflicto"

    def __init__(self, motivos):
        motivos = [motivos] if isinstance(motivos, str) else list(motivos)
        super().__init__({"detail": " ".join(motivos), "motivos": motivos})
