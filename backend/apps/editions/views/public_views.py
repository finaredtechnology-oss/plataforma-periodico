from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.http import Http404
from apps.editions.selectors.public_edition_selectors import (
    get_public_editions, get_public_edition_by_slug
)
from apps.editions.serializers.edition_serializers import EditionPublicSerializer

class PublicEditionListView(generics.ListAPIView):
    """
    GET: Public list of published editions of active tenants.
    """
    permission_classes = [AllowAny]
    serializer_class = EditionPublicSerializer

    def get_queryset(self):
        qs = get_public_editions()
        
        # If user is logged in (authenticated) and not admin/superuser, restrict by active subscription
        user = self.request.user
        if user and user.is_authenticated and not user.is_superuser and getattr(user, 'usr_correo', '') != 'admin':
            from apps.purchases.services.purchase_service import get_user_active_subscription_details
            from django.db import models
            start_date, expiry_date = get_user_active_subscription_details(user)
            if expiry_date:
                qs = qs.filter(
                    models.Q(modalidad='GRATUITA') |
                    models.Q(modalidad='PAGO', fecha_publicacion__gte=start_date, fecha_publicacion__lte=expiry_date)
                )
            else:
                qs = qs.filter(modalidad='GRATUITA')
        
        # Public filtering options
        company_id = self.request.query_params.get('company_id')
        if company_id:
            qs = qs.filter(empresa_id=company_id)
            
        company_slug = self.request.query_params.get('company_slug')
        if company_slug:
            qs = qs.filter(empresa__slug=company_slug)
            
        titulo = self.request.query_params.get('titulo')
        if titulo:
            qs = qs.filter(titulo__icontains=titulo)

        # Always order public editions by publication datetime descending
        return qs.order_by('-fecha_publicacion')


class PublicEditionDetailView(generics.RetrieveAPIView):
    """
    GET: Retrieve details of a published edition by slug.
    """
    permission_classes = [AllowAny]
    serializer_class = EditionPublicSerializer
    lookup_field = 'slug'

    def get_object(self):
        company_slug = self.kwargs.get('company_slug')
        slug = self.kwargs.get('slug')
        edition = get_public_edition_by_slug(company_slug, slug)
        if not edition:
            raise Http404("La edición especificada no existe, no está publicada o fue suspendida.")
            
        # If user is logged in (authenticated) and not admin/superuser, restrict by active subscription
        user = self.request.user
        if user and user.is_authenticated and not user.is_superuser and getattr(user, 'usr_correo', '') != 'admin':
            if edition.modalidad != 'GRATUITA':
                from apps.purchases.services.purchase_service import get_user_active_subscription_details
                start_date, expiry_date = get_user_active_subscription_details(user)
                if not expiry_date or not edition.fecha_publicacion or not (start_date <= edition.fecha_publicacion <= expiry_date):
                    raise Http404("La edición especificada no existe, no está publicada o fue suspendida.")
                
        return edition



from rest_framework.views import APIView

class ShortNewsListView(APIView):
    """
    GET: List short news for the Amazonia Diario sidebar.
    """
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        # Structured mock data matching the reference image
        news_data = [
            {
                "time": "10:45 a.m.",
                "title": "Ganó el presidente en Perú",
                "summary": "Resultados oficiales confirman su victoria en segunda vuelta.",
                "image_url": "https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=150&auto=format&fit=crop&q=60"
            },
            {
                "time": "09:30 a.m.",
                "title": "Terremoto en Venezuela",
                "summary": "Sismo de magnitud 6.2 sacude varias zonas del país. No se reportan víctimas.",
                "image_url": "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=150&auto=format&fit=crop&q=60"
            },
            {
                "time": "08:15 a.m.",
                "title": "Lluvias intensas afectan el norte",
                "summary": "Varias regiones en alerta por desbordes de ríos y huaicos.",
                "image_url": "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=150&auto=format&fit=crop&q=60"
            },
            {
                "time": "07:00 a.m.",
                "title": "Precio del dólar continúa a la baja",
                "summary": "Moneda americana registra ligera caída en el mercado local.",
                "image_url": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=150&auto=format&fit=crop&q=60"
            },
            {
                "time": "06:30 a.m.",
                "title": "Selección Peruana se prepara para la fecha",
                "summary": "Entrenamientos en Lima con miras al próximo partido de eliminatorias.",
                "image_url": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=150&auto=format&fit=crop&q=60"
            }
        ]
        return Response(news_data, status=status.HTTP_200_OK)

