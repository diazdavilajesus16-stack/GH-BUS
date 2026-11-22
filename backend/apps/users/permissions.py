from rest_framework.permissions import BasePermission


class HasAnyRole(BasePermission):
    """Permite el acceso si el usuario tiene alguno de los roles de `view.allowed_roles`.

    Falla cerrado: una vista que olvide declarar `allowed_roles` rechaza a todos.
    Esta es la verificación REAL de permisos; ocultar botones en el frontend es solo comodidad.
    """

    message = "No tienes permiso para realizar esta acción."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        requeridos = set(getattr(view, "allowed_roles", ()) or ())
        return bool(requeridos & set(user.role_names()))


class HasRoleForMethod(BasePermission):
    """Roles distintos para leer y para escribir: `view.read_roles` (GET/HEAD/OPTIONS) y `view.write_roles`.

    Falla cerrado: si la vista no declara los roles del método, se rechaza a todos.
    """

    message = "No tienes permiso para realizar esta acción."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        lectura = request.method in ("GET", "HEAD", "OPTIONS")
        requeridos = set(getattr(view, "read_roles" if lectura else "write_roles", ()) or ())
        return bool(requeridos & set(user.role_names()))
