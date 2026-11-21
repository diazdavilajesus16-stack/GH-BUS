from rest_framework.exceptions import PermissionDenied
from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    """Manejador estándar de DRF + registro en la bitácora de los permisos denegados."""
    respuesta = drf_exception_handler(exc, context)
    if isinstance(exc, PermissionDenied):
        request = context.get("request")
        if request is not None and getattr(request.user, "is_authenticated", False):
            from apps.audit.services import Accion, registrar

            registrar(
                request=request,
                accion=Accion.PERMISO_DENEGADO,
                entidad=request.path,
                cambios={"metodo": request.method},
            )
    return respuesta
