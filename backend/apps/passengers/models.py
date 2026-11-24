from django.db import models
from apps.users.models import User

class Passenger(models.Model):
    DOCUMENT_TYPES = [
        ('DNI', 'DNI'),
        ('CE', 'Carné de Extranjería'),
        ('PASSPORT', 'Pasaporte'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='passengers')
    document_type = models.CharField(max_length=10, choices=DOCUMENT_TYPES, default='DNI')
    document_number = models.CharField(max_length=20, db_index=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Pasajero"
        verbose_name_plural = "Pasajeros"
        unique_together = ('document_type', 'document_number')

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.document_number})"