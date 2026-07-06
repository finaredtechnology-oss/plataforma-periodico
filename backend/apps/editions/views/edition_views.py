from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.views import APIView
from django.http import Http404
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.authorization.permissions.drf_permissions import (
    IsAuthenticatedAndActive, HasCompanyPermission, HasAnyCompanyPermission
)
from apps.plans.permissions.has_plan_feature import HasPlanFeature
from apps.plans.permissions.within_plan_limit import WithinPlanLimit
from apps.editions.selectors.edition_selectors import (
    get_company_editions, get_company_edition_by_id
)
from apps.editions.serializers.edition_serializers import (
    EditionListSerializer, EditionDetailSerializer,
    EditionCreateSerializer, EditionUpdateSerializer,
    EditionScheduleSerializer
)
from apps.editions.services.edition_create_service import create_edition
from apps.editions.services.edition_update_service import update_edition
from apps.editions.services.edition_schedule_service import schedule_publication
from apps.editions.services.edition_publish_service import publish_edition
from apps.editions.services.edition_suspend_service import suspend_edition
from apps.editions.services.edition_reactivate_service import reactivate_edition

class CompanyEditionListCreateView(generics.GenericAPIView):
    """
    GET: List editions for a company with filters, searches and pagination.
    POST: Create a draft edition inside plan limits.
    """
    def get_permissions(self):
        if self.request.method == 'POST':
            # Create requires RBAC permission + Plan Feature + Plan Limits
            return [IsAuthenticatedAndActive(), HasCompanyPermission(), HasPlanFeature(), WithinPlanLimit()]
        return [IsAuthenticatedAndActive(), HasCompanyPermission()]

    required_permission = 'EDICION_VER'  # Base for GET
    # POST required permissions/limits
    required_plan_feature = 'EDICION_CREAR'
    required_plan_limit = 'editions'

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return EditionCreateSerializer
        return EditionListSerializer

    def get_queryset(self):
        company_id = self.kwargs.get('emp_id')
        qs = get_company_editions(company_id)

        # 1. State Filter
        estado = self.request.query_params.get('estado')
        if estado:
            qs = qs.filter(estado=estado)

        # 2. Search by Title
        titulo = self.request.query_params.get('titulo')
        if titulo:
            qs = qs.filter(titulo__icontains=titulo)

        # 3. Date range filter
        fecha_inicio = self.request.query_params.get('fecha_inicio')
        if fecha_inicio:
            qs = qs.filter(fecha_edicion__gte=fecha_inicio)
        
        fecha_fin = self.request.query_params.get('fecha_fin')
        if fecha_fin:
            qs = qs.filter(fecha_edicion__lte=fecha_fin)

        # 4. Ordering
        allowed_ordering = {
            'fecha_edicion', '-fecha_edicion',
            'titulo', '-titulo',
            'fecha_publicacion', '-fecha_publicacion',
            'fecha_creacion', '-fecha_creacion'
        }
        ordering = self.request.query_params.get('ordering', '-fecha_edicion')
        if ordering in allowed_ordering:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by('-fecha_edicion')

        return qs

    def get(self, request, emp_id):
        # Override get for list view with permissions
        # Make sure that POST permission attributes don't taint GET
        self.required_permission = 'EDICION_VER'
        
        queryset = self.get_queryset()
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, emp_id):
        # Override required_permission dynamically for POST checking
        self.required_permission = 'EDICION_CREAR'
        self.check_permissions(request)
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Get client IP address
        ip_addr = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT')
        
        try:
            edition = create_edition(
                empresa_id=int(emp_id),
                creador=request.user,
                data=serializer.validated_data,
                ip_address=ip_addr,
                user_agent=user_agent
            )
        except DjangoValidationError as de:
            raise ValidationError({"detail": de.message})
            
        output_serializer = EditionDetailSerializer(edition)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class CompanyEditionDetailUpdateView(generics.GenericAPIView):
    """
    GET: Retrieve details of an active edition of a company.
    PATCH: Update allowed fields of the edition.
    """
    permission_classes = [IsAuthenticatedAndActive]
    required_permission = 'EDICION_VER'

    def get_serializer_class(self):
        if self.request.method == 'PATCH':
            return EditionUpdateSerializer
        return EditionDetailSerializer

    def get_object(self):
        company_id = self.kwargs.get('emp_id')
        edition_id = self.kwargs.get('edi_id')
        edition = get_company_edition_by_id(company_id, edition_id)
        if not edition:
            raise Http404("La edición no existe.")
        return edition

    def check_permissions(self, request):
        """
        Custom permissions check:
        For GET: Allow access if the user has administrative company permission OR customer access.
        For PATCH/DELETE: Require HasCompanyPermission.
        """
        from apps.authorization.permissions.drf_permissions import IsAuthenticatedAndActive, HasCompanyPermission
        if not IsAuthenticatedAndActive().has_permission(request, self):
            self.permission_denied(
                request,
                message="Tu cuenta no está activa o verificada."
            )

        if request.method == 'GET':
            has_admin_access = False
            try:
                perm = HasCompanyPermission()
                if perm.has_permission(request, self):
                    has_admin_access = True
            except Exception:
                pass

            if not has_admin_access:
                from django.utils import timezone
                from apps.access.models.acceso_edicion import AccesoEdicion
                from django.db import models
                from apps.purchases.services.purchase_service import get_user_active_subscription_expiry
                
                edition = self.get_object()
                now = timezone.now()
                has_access = False
                
                if edition.modalidad == 'GRATUITA':
                    has_access = True
                else:
                    from apps.purchases.services.purchase_service import get_user_active_subscription_details
                    start_date, expiry_date = get_user_active_subscription_details(request.user)
                    if expiry_date and edition.fecha_publicacion and start_date <= edition.fecha_publicacion <= expiry_date:
                        has_access = True
                    else:
                        has_access = AccesoEdicion.objects.using('periodico_db').filter(
                            usuario=request.user,
                            edicion=edition,
                            estado='ACTIVO',
                            fecha_inicio__lte=now
                        ).filter(
                            models.Q(fecha_fin__isnull=True) | models.Q(fecha_fin__gt=now)
                        ).exists()

                if not has_access:
                    self.permission_denied(
                        request,
                        message="No tienes acceso a esta edición."
                    )
        else:
            perm = HasCompanyPermission()
            if not perm.has_permission(request, self):
                self.permission_denied(
                    request,
                    message="No tienes permisos para modificar esta edición."
                )

    def get(self, request, emp_id, edi_id):
        self.required_permission = 'EDICION_VER'
        edition = self.get_object()
        serializer = self.get_serializer(edition)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, emp_id, edi_id):
        self.required_permission = 'EDICION_EDITAR'
        self.check_permissions(request)
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        ip_addr = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT')
        
        try:
            edition = update_edition(
                company_id=int(emp_id),
                edition_id=int(edi_id),
                user=request.user,
                data=serializer.validated_data,
                ip_address=ip_addr,
                user_agent=user_agent
            )
        except DjangoValidationError as de:
            raise ValidationError({"detail": de.message})
            
        output_serializer = EditionDetailSerializer(edition)
        return Response(output_serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, emp_id, edi_id):
        self.required_permission = 'EDICION_EDITAR'
        self.check_permissions(request)
        
        edition = self.get_object()
        
        from django.utils import timezone
        from apps.audit.services.audit_service import AuditService
        from apps.audit.constants import AuditoriaAccion, AuditoriaModulo, AuditoriaResultado
        from django.db import transaction
        from apps.editions.models.edicion import Edicion
        
        now = timezone.now()
        
        with transaction.atomic(using='periodico_db'):
            # Lock the record
            edition = Edicion.objects.using('periodico_db').select_for_update().get(id=edition.id)
            edition.eliminado = True
            edition.fecha_eliminacion = now
            edition.fecha_actualizacion = now
            if request.user:
                edition.actualizado_por = request.user
            edition.save(using='periodico_db')
            
            # Record audit event
            ip_addr = request.META.get('REMOTE_ADDR')
            user_agent = request.META.get('HTTP_USER_AGENT')
            
            AuditService.record_event(
                usuario=request.user,
                emp_id=int(emp_id),
                modulo=AuditoriaModulo.M05,
                accion=getattr(AuditoriaAccion, 'EDICION_ELIMINADA', 'EDICION_ACTUALIZADA'),
                entidad="Edicion",
                entidad_id=str(edition.id),
                valores_anteriores={"eliminado": False},
                valores_nuevos={"eliminado": True},
                resultado=AuditoriaResultado.EXITOSO,
                ip_address=ip_addr,
                user_agent=user_agent
            )
            
        return Response({"detail": "Edición eliminada con éxito."}, status=status.HTTP_200_OK)


class CompanyEditionScheduleView(generics.GenericAPIView):
    """
    POST: Schedule publication of an edition.
    """
    permission_classes = [IsAuthenticatedAndActive, HasCompanyPermission, HasPlanFeature]
    required_permission = 'EDICION_PUBLICAR'
    required_plan_feature = 'EDICION_PUBLICAR'
    serializer_class = EditionScheduleSerializer

    def post(self, request, emp_id, edi_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        ip_addr = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT')
        
        try:
            edition = schedule_publication(
                company_id=int(emp_id),
                edition_id=int(edi_id),
                user=request.user,
                scheduled_at=serializer.validated_data['scheduled_at'],
                timezone_name=serializer.validated_data['timezone'],
                ip_address=ip_addr,
                user_agent=user_agent
            )
        except DjangoValidationError as de:
            raise ValidationError({"detail": de.message})
            
        output_serializer = EditionDetailSerializer(edition)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class CompanyEditionPublishView(generics.GenericAPIView):
    """
    POST: Immediately publish an edition.
    """
    permission_classes = [IsAuthenticatedAndActive, HasCompanyPermission, HasPlanFeature]
    required_permission = 'EDICION_PUBLICAR'
    required_plan_feature = 'EDICION_PUBLICAR'

    def post(self, request, emp_id, edi_id):
        ip_addr = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT')
        
        try:
            edition = publish_edition(
                company_id=int(emp_id),
                edition_id=int(edi_id),
                user=request.user,
                ip_address=ip_addr,
                user_agent=user_agent
            )
        except DjangoValidationError as de:
            raise ValidationError({"detail": de.message})
            
        output_serializer = EditionDetailSerializer(edition)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class CompanyEditionSuspendView(generics.GenericAPIView):
    """
    POST: Suspend a published edition.
    """
    permission_classes = [IsAuthenticatedAndActive, HasCompanyPermission]
    required_permission = 'EDICION_SUSPENDER'

    def post(self, request, emp_id, edi_id):
        reason = request.data.get('reason')
        ip_addr = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT')
        
        try:
            edition = suspend_edition(
                company_id=int(emp_id),
                edition_id=int(edi_id),
                user=request.user,
                reason=reason,
                ip_address=ip_addr,
                user_agent=user_agent
            )
        except DjangoValidationError as de:
            raise ValidationError({"detail": de.message})
            
        output_serializer = EditionDetailSerializer(edition)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class CompanyEditionReactivateView(generics.GenericAPIView):
    """
    POST: Reactivate a suspended edition (returns it to PUBLICADA or BORRADOR).
    """
    permission_classes = [IsAuthenticatedAndActive, HasAnyCompanyPermission]
    required_permissions = ['EDICION_PUBLICAR', 'EDICION_SUSPENDER']

    def post(self, request, emp_id, edi_id):
        target_state = request.data.get('target_state', 'PUBLICADA')
        ip_addr = request.META.get('REMOTE_ADDR')
        user_agent = request.META.get('HTTP_USER_AGENT')
        
        try:
            edition = reactivate_edition(
                company_id=int(emp_id),
                edition_id=int(edi_id),
                user=request.user,
                target_state=target_state,
                ip_address=ip_addr,
                user_agent=user_agent
            )
        except DjangoValidationError as de:
            raise ValidationError({"detail": de.message})
            
        output_serializer = EditionDetailSerializer(edition)
        return Response(output_serializer.data, status=status.HTTP_200_OK)


class CompanyEditionNextCodeView(APIView):
    """
    GET: Calculate the next logical code number for a given collection type.
    """
    permission_classes = [IsAuthenticatedAndActive, HasCompanyPermission]
    required_permission = 'EDICION_VER'

    def get(self, request, emp_id):
        collection_type = request.query_params.get('type')
        prefix_map = {
            'PERIÓDICO': 'PER-',
            'REVISTA': 'REV-',
            'CÓMIC': 'COM-'
        }
        
        def get_next_number(prefix):
            # Get all editions (including deleted) for company and filter by prefix code to avoid code duplication conflicts
            from apps.editions.models.edicion import Edicion
            queryset = Edicion.objects.using('periodico_db').filter(empresa_id=emp_id, codigo__startswith=prefix)
            codes = queryset.values_list('codigo', flat=True)
            max_num = 0
            for code in codes:
                try:
                    num_part = code[len(prefix):]
                    num = int(num_part)
                    if num > max_num:
                        max_num = num
                except ValueError:
                    pass
            return max_num + 1

        if collection_type:
            collection_type = collection_type.upper()
            prefix = prefix_map.get(collection_type, 'PER-')
            next_num = get_next_number(prefix)
            return Response({
                'prefix': prefix,
                'next_number': next_num,
                'next_code': f"{prefix}{next_num}"
            }, status=status.HTTP_200_OK)
        else:
            # Bulk calculate next codes for all collection types
            res_data = {}
            for col_type, prefix in prefix_map.items():
                next_num = get_next_number(prefix)
                res_data[col_type] = {
                    'prefix': prefix,
                    'next_number': next_num,
                    'next_code': f"{prefix}{next_num}"
                }
            return Response(res_data, status=status.HTTP_200_OK)


class CompanyEditionPageView(APIView):
    """
    GET /api/v1/companies/{emp_id}/editions/{edi_id}/pages/{page_number}/
    Serves a protected page image file for any of the company's editions.
    Used by the administrative visor/viewer.
    """
    permission_classes = [IsAuthenticatedAndActive]

    def get(self, request, emp_id, edi_id, page_number):
        from django.http import FileResponse
        from apps.editions.models.edicion_pagina import EdicionPagina
        from apps.files.services.storage_service import StorageService
        from apps.authorization.services.permission_service import is_platform_superadmin, calculate_effective_permissions
        from apps.authorization.selectors.auth_selector import get_user_company_relation
        from apps.access.models.acceso_edicion import AccesoEdicion
        from django.utils import timezone
        from django.db import models

        edition = get_company_edition_by_id(int(emp_id), int(edi_id))
        if not edition:
            raise Http404("La edición especificada no existe.")

        # Check administrative access
        is_admin = False
        if is_platform_superadmin(request.user):
            is_admin = True
        else:
            relation = get_user_company_relation(request.user.id, int(emp_id))
            if relation:
                effective_perms = calculate_effective_permissions(request.user.id, int(emp_id))
                if 'EDICION_VER' in effective_perms:
                    is_admin = True

        if not is_admin:
            # Check if the user has active access to the edition
            now = timezone.now()
            has_access = False
            
            if edition.modalidad == 'GRATUITA':
                has_access = True
            else:
                # Check active subscription first
                from apps.purchases.services.purchase_service import get_user_active_subscription_details
                start_date, expiry_date = get_user_active_subscription_details(request.user)
                if expiry_date and edition.fecha_publicacion and start_date <= edition.fecha_publicacion <= expiry_date:
                    has_access = True
                else:
                    # Check active AccesoEdicion record
                    has_access = AccesoEdicion.objects.using('periodico_db').filter(
                        usuario=request.user,
                        edicion=edition,
                        estado='ACTIVO',
                        fecha_inicio__lte=now
                    ).filter(
                        models.Q(fecha_fin__isnull=True) | models.Q(fecha_fin__gt=now)
                    ).exists()
                
            if not has_access:
                raise PermissionDenied("No tienes acceso a esta edición.")

        try:
            page = EdicionPagina.objects.using('periodico_db').select_related('archivo').get(
                edicion=edition,
                edp_numero_pagina=page_number,
                edp_es_actual=True,
                edp_estado='GENERADA'
            )
        except EdicionPagina.DoesNotExist:
            return Response(
                {"error": f"La página {page_number} no existe en esta edición o no está generada."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Serve the physical file from private storage
        try:
            file_path = StorageService.get_private_absolute_path(page.archivo.ruta_storage)
            if not file_path.exists() or not file_path.is_file():
                return Response(
                    {"error": "El archivo físico de la página no está disponible en almacenamiento."},
                    status=status.HTTP_404_NOT_FOUND
                )

            return FileResponse(open(file_path, 'rb'), content_type='image/jpeg')
        except ValueError:
            return Response(
                {"error": "Ruta de archivo inválida."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"error": f"Error al servir la página: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


from apps.notifications.models.notificacion import Notificacion
from apps.editions.tasks import distribute_edition_to_subscribers_task

class CompanyEditionDistributionStatusView(generics.GenericAPIView):
    """
    GET: Retrieve delivery status details of a published edition to active subscribers.
    """
    permission_classes = [IsAuthenticatedAndActive, HasCompanyPermission]
    required_permission = 'EDICION_VER'

    def get(self, request, emp_id, edi_id):
        self.check_permissions(request)
        
        try:
            # Query all notifications related to this edition
            notifs = Notificacion.objects.using('periodico_db').filter(
                empresa_id=int(emp_id),
                entidad='Edicion',
                entidad_id=str(edi_id)
            ).select_related('usuario').order_by('fecha_creacion')

            data = []
            for n in notifs:
                data.append({
                    'id': n.id,
                    'estado': n.estado, # 'ENVIADA' or 'FALLIDA'
                    'fecha_envio': n.fecha_envio or n.fecha_creacion,
                    'mensaje_error': n.mensaje if n.estado == 'FALLIDA' else None,
                    'usuario': {
                        'id': n.usuario.id,
                        'nombres': n.usuario.nombres,
                        'apellidos': n.usuario.apellidos,
                        'correo': n.usuario.usr_correo
                    }
                })

            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"detail": f"Error al obtener el estado de distribución: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CompanyEditionRetryDistributionView(generics.GenericAPIView):
    """
    POST: Re-enqueue the Celery subscriber distribution task for this edition.
    """
    permission_classes = [IsAuthenticatedAndActive, HasCompanyPermission]
    required_permission = 'EDICION_PUBLICAR'

    def post(self, request, emp_id, edi_id):
        self.check_permissions(request)
        
        try:
            distribute_edition_to_subscribers_task.delay(int(edi_id))
            return Response(
                {"detail": "Reintento de distribución encolado con éxito."},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {"detail": f"Error al encolar el reintento de distribución: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

