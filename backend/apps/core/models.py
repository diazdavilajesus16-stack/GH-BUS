from django.db import models


class TimeStamped(models.Model):
    """Sellos de creación y modificación que lleva toda tabla de negocio (docs/database.md §0)."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
