from django.contrib import admin
from django.urls import path, include
from config.views import HealthCheckView, DatabaseHealthCheckView, RedisHealthCheckView, ServeMediaView

urlpatterns = [
    path('admin/', admin.site.urls),
    # Authentication endpoints
    path('api/v1/auth/', include('apps.accounts.urls')),
    # Companies endpoints
    path('api/v1/companies/', include('apps.companies.urls')),
    # Plans endpoints
    path('api/v1/plans/', include('apps.plans.urls')),
    # Editions endpoints
    path('api/v1/', include('apps.editions.urls')),
    # Access endpoints
    path('api/v1/', include('apps.access.urls')),
    # Reading endpoints
    path('api/v1/', include('apps.reading.urls')),
    # Purchases endpoints (purchase, mock-confirm, my-purchases)
    path('api/v1/', include('apps.purchases.urls')),
    # Payments endpoints (webhooks)
    path('api/v1/payments/', include('apps.payments.urls')),
    # Configuration endpoints (landing Hero settings)
    path('api/v1/configuration/', include('apps.configuration.urls')),
    # Payments Methods Admin endpoints
    path('api/v1/', include('apps.payments_methods_admin.urls')),
    # Content endpoints
    path('api/v1/', include('apps.content.urls')),
    # Versioned API Health Check endpoints

    path('api/v1/health/', HealthCheckView.as_view(), name='health_general'),
    path('api/v1/health/database/', DatabaseHealthCheckView.as_view(), name='health_database'),
    path('api/v1/health/redis/', RedisHealthCheckView.as_view(), name='health_redis'),
    path('media/<path:path>', ServeMediaView.as_view(), name='serve_media'),
]

from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.urls import re_path

if settings.DEBUG:
    # Ensure MEDIA_URL has correct slash prefix for static helper
    media_url = settings.MEDIA_URL
    if not media_url.startswith('/'):
        media_url = '/' + media_url
    urlpatterns += static(media_url, document_root=settings.MEDIA_ROOT)

from django.views.decorators.cache import never_cache
from django.views.static import serve

# Serve Open Graph image at root level directly
urlpatterns += [
    re_path(r'^og-amazonia-diario\.png$', serve, {
        'document_root': settings.STATICFILES_DIRS[0] if settings.STATICFILES_DIRS else settings.STATIC_ROOT,
        'path': 'og-amazonia-diario.png'
    }),
]

# Serve PWA manifest, service worker and logo at root level
from django.views.static import serve
from django.conf import settings

urlpatterns += [
    path('sw.js', serve, {
        'document_root': settings.STATICFILES_DIRS[0] if settings.STATICFILES_DIRS else settings.STATIC_ROOT,
        'path': 'sw.js'
    }),
    path('manifest.json', serve, {
        'document_root': settings.STATICFILES_DIRS[0] if settings.STATICFILES_DIRS else settings.STATIC_ROOT,
        'path': 'manifest.json'
    }),
    path('logo_amazonia.png', serve, {
        'document_root': settings.STATICFILES_DIRS[0] if settings.STATICFILES_DIRS else settings.STATIC_ROOT,
        'path': 'logo_amazonia.png'
    }),
]

# SPA fallback: redirect any path not starting with api/, admin/, static/, or media/ to index.html
urlpatterns += [
    re_path(r'^(?!api/|admin/|static/|media/|sw\.js|manifest\.json|logo_amazonia\.png).*$', never_cache(TemplateView.as_view(template_name='index.html')), name='frontend-spa'),
]
