from django.contrib.auth.models import AbstractUser
from django.db import models

from .roles import ADMINISTRADOR, TODOS


class User(AbstractUser):
    """Usuario del sistema.

    Se define desde el inicio un modelo propio porque Django no permite cambiarlo
    después de la primera migración. Los roles son grupos de Django (ver roles.py).
    """

    email = models.EmailField("correo electrónico", unique=True)
    telefono = models.CharField("teléfono", max_length=20, blank=True)

    class Meta:
        db_table = "usuario"
        verbose_name = "usuario"
        verbose_name_plural = "usuarios"

    def save(self, *args, **kwargs):
        self.email = (self.email or "").strip().lower()
        super().save(*args, **kwargs)

    def role_names(self) -> list[str]:
        """Roles efectivos. Un superusuario cuenta siempre como administrador.

        Usa `groups.all()` (y no values_list) para aprovechar prefetch_related en los listados.
        """
        nombres = {g.name for g in self.groups.all()}
        if self.is_superuser:
            nombres.add(ADMINISTRADOR)
        return sorted(n for n in nombres if n in TODOS)

    def __str__(self):
        return self.get_username()
