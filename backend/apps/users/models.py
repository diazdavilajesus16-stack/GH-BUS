from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Usuario del sistema.

    Se define desde el inicio un modelo propio porque Django no permite cambiarlo
    después de la primera migración. Los roles y permisos (RBAC) se añaden en el
    paso 9; el correo es único.
    """

    email = models.EmailField("correo electrónico", unique=True)
    telefono = models.CharField("teléfono", max_length=20, blank=True)

    class Meta:
        db_table = "usuario"
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"

    def __str__(self):
        return self.get_username()
