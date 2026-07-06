from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.utils import timezone
from django.db import models
from apps.editions.models.edicion import Edicion
from apps.access.models.acceso_edicion import AccesoEdicion
from apps.authorization.selectors.auth_selector import get_active_user_companies
from apps.authorization.services.permission_service import calculate_effective_permissions, is_platform_superadmin
from apps.access.serializers.library_serializers import LibraryEditionSerializer

class LibraryListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        GET /api/v1/library/
        Returns a list of all published editions that the authenticated user has access to.
        Access is determined by:
          - Active subscription (all editions published up to the subscription's end date)
          - User has company-level permissions (EDICION_VER) or is Platform Superadmin/admin.
        """
        user = request.user
        now = timezone.now()

        # Check if the user is platform superadmin
        is_super = is_platform_superadmin(user) or getattr(user, 'usr_correo', '') == 'admin'

        if is_super:
            q_conditions = models.Q()
        else:
            # Check company context permissions
            company_ids_with_permission = []
            active_company_relations = get_active_user_companies(user)
            
            for rel in active_company_relations:
                company_id = rel.empresa_id
                perms = calculate_effective_permissions(user.id, company_id)
                if 'EDICION_VER' in perms:
                    company_ids_with_permission.append(company_id)
                    
            from apps.purchases.services.purchase_service import get_user_active_subscription_details
            start_date, expiry_date = get_user_active_subscription_details(user)
            
            # Base Q conditions: free editions are always visible
            q_free = models.Q(modalidad='GRATUITA')
            
            # Paid editions conditions
            q_paid_conditions = models.Q(id__in=[])
            if company_ids_with_permission:
                q_paid_conditions = models.Q(empresa_id__in=company_ids_with_permission)
                if expiry_date:
                    q_paid_conditions |= models.Q(fecha_publicacion__gte=start_date, fecha_publicacion__lte=expiry_date)
            else:
                if expiry_date:
                    q_paid_conditions = models.Q(fecha_publicacion__gte=start_date, fecha_publicacion__lte=expiry_date)
            
            q_paid = models.Q(modalidad='PAGO') & q_paid_conditions
            q_conditions = q_free | q_paid

        # Retrieve published, non-deleted editions from active, non-deleted companies
        editions = Edicion.objects.using('periodico_db').select_related('empresa').filter(
            estado='PUBLICADA',
            eliminado=False,
            empresa__estado='ACTIVA',
            empresa__eliminado=False
        ).filter(q_conditions).distinct().order_by('-fecha_publicacion')

        serializer = LibraryEditionSerializer(editions, many=True)
        return Response(serializer.data)


from rest_framework.exceptions import PermissionDenied

class UserAssignedEditionsListView(APIView):
    """
    GET /api/v1/users/{user_id}/editions/
    Returns all published editions assigned to the user (via active plan subscription).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        user = request.user
        
        # Security check: only allow requesting own editions unless it is the admin user
        if user.id != int(user_id) and getattr(user, 'usr_correo', '') != 'admin':
            raise PermissionDenied("No tienes permiso para consultar las ediciones de este usuario.")

        # Admin bypass
        if user.is_superuser or getattr(user, 'usr_correo', '') == 'admin':
            q_conditions = models.Q()
        else:
            from apps.purchases.services.purchase_service import get_user_active_subscription_details
            start_date, expiry_date = get_user_active_subscription_details(user)
            
            # Base Q conditions: free editions are always visible
            q_free = models.Q(modalidad='GRATUITA')
            
            if expiry_date:
                # Active subscriber sees all free editions AND paid editions published during subscription period
                q_paid = models.Q(modalidad='PAGO', fecha_publicacion__gte=start_date, fecha_publicacion__lte=expiry_date)
                q_conditions = q_free | q_paid
            else:
                # No active subscription -> see only free editions
                q_conditions = q_free

        # Retrieve published, non-deleted editions from active, non-deleted companies
        editions = Edicion.objects.using('periodico_db').select_related('empresa').filter(
            estado='PUBLICADA',
            eliminado=False,
            empresa__estado='ACTIVA',
            empresa__eliminado=False
        ).filter(q_conditions).distinct().order_by('-fecha_publicacion')

        data = []
        for ed in editions:
            # Fetch PDF file
            pdf_rel = ed.archivos_asociados.filter(
                tipo_archivo='PDF_ORIGINAL',
                es_actual=True,
                estado='ACTIVO',
                archivo__estado='DISPONIBLE',
                archivo__eliminado=False
            ).select_related('archivo').first()

            pdf_url = f"/media/{pdf_rel.archivo.ruta_storage}" if pdf_rel and pdf_rel.archivo else None

            # Fetch cover file
            cover_rel = ed.archivos_asociados.filter(
                tipo_archivo='PORTADA',
                es_actual=True,
                estado='ACTIVO',
                archivo__estado='DISPONIBLE',
                archivo__eliminado=False
            ).select_related('archivo').first()

            portada_url = f"/media/{cover_rel.archivo.ruta_storage}" if cover_rel and cover_rel.archivo else None

            data.append({
                'edition_id': ed.id,
                'company_id': ed.empresa_id,
                'title': ed.titulo,
                'publication_date': ed.fecha_publicacion,
                'pdf_url': pdf_url,
                'portada_url': portada_url,
                'status': ed.estado
            })

        return Response(data, status=status.HTTP_200_OK)

