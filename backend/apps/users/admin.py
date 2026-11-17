from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class GHUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Contacto", {"fields": ("telefono",)}),)
    list_display = ("username", "email", "is_active", "is_staff")
