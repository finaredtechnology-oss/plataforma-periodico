import os

# Default to development settings
django_env = os.getenv('DJANGO_ENV', 'development').lower()

if django_env == 'production':
    from .production import *
else:
    from .development import *


#MEDIA_URL = "/media/"
#MEDIA_ROOT = "/var/www/media"

# Media configuration
MEDIA_URL = os.getenv("MEDIA_URL", "/media/")
MEDIA_ROOT = os.getenv("MEDIA_ROOT", str(BASE_DIR.parent / "media"))
