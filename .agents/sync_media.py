import os
import sys
from pathlib import Path

# Add backend directory to python path
sys.path.append(str(Path(r"c:\Users\Joseph\Desktop\Periodico-digital\backend")))

import django
import urllib.request
import urllib.error

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from django.conf import settings
from apps.editions.models.edicion_landing import EdicionLanding
from apps.content.models.noticia_landing import NoticiaLanding
from apps.files.models.archivo import Archivo

# Local media root
local_media_root = Path(r"c:\Users\Joseph\Desktop\Periodico-digital\media")
prod_base_url = "https://periodico.finatech.com.pe"

def download_file(relative_path):
    # Normalize paths (strip leading slashes, replace media url prefix if present)
    clean_path = relative_path.replace('/media/', '').replace('media/', '').strip()
    local_path = local_media_root / clean_path
    
    if local_path.exists():
        print(f"[OK] File already exists locally: {clean_path}")
        return
        
    print(f"[SYNC] File is missing: {clean_path}. Downloading...")
    prod_url = f"{prod_base_url}/media/{clean_path}"
    
    try:
        # Create directories if they don't exist
        local_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Download the file
        req = urllib.request.Request(
            prod_url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            with open(local_path, 'wb') as f:
                f.write(response.read())
            print(f"[SUCCESS] Downloaded {clean_path}")
    except urllib.error.HTTPError as e:
        print(f"[FAILED] HTTP {e.code} for {prod_url}")
    except Exception as e:
        print(f"[ERROR] Could not download {clean_path}: {e}")

print("=== STARTING MEDIA SYNC FROM PRODUCTION ===")

# Sync EdicionLanding
print("Syncing EdicionLanding images...")
for e in EdicionLanding.objects.using('periodico_db').all():
    if e.imagen:
        download_file(e.imagen)

# Sync NoticiaLanding
print("Syncing NoticiaLanding images...")
for n in NoticiaLanding.objects.using('periodico_db').all():
    if n.imagen:
        download_file(n.imagen)

# Sync Archivo
print("Syncing Archivo files...")
for a in Archivo.objects.using('periodico_db').all():
    if a.ruta_storage:
        download_file(a.ruta_storage)

print("=== MEDIA SYNC COMPLETED ===")
