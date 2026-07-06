import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from apps.editions.models.edicion import Edicion

try:
    editions = Edicion.objects.using('periodico_db').all()
    for e in editions:
        print(f"ID: {e.id}, Titulo: {e.titulo}, Modalidad: {e.modalidad}, Empresa: {e.empresa_id}")
except Exception as ex:
    print("Error:", ex)
