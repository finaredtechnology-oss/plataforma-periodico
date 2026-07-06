from django.utils import timezone
from django.db import models
from django.core.exceptions import ValidationError
from apps.access.models.acceso_edicion import AccesoEdicion
from apps.access.models.acceso_tipo import AccesoTipo
from apps.authorization.services.permission_service import calculate_effective_permissions

def can_user_read_edition(user, edition) -> bool:
    """
    Determines if a user has full reading access to an edition.
    Validates:
      - Authenticated and active user.
      - Published and non-deleted edition.
      - Active and non-deleted company.
      - At least one processed page (edp_es_actual=True, edp_estado='GENERADA') is available.
      - Access rights (active plan subscription, active individual access, company permission EDICION_VER, or admin bypass).
    """
    if not user or not user.is_authenticated or not user.is_active:
        return False
        
    if edition.eliminado or edition.estado != 'PUBLICADA':
        return False
        
    if edition.empresa.eliminado or edition.empresa.estado != 'ACTIVA':
        return False
        
    # Check if there is at least one processed page available
    if not edition.paginas.filter(edp_es_actual=True, edp_estado='GENERADA').exists():
        return False

    # 1. Admin/Superuser bypass
    if user.is_superuser or getattr(user, 'usr_correo', '') == 'admin':
        return True

    # 2. Free edition bypass: any authenticated active user can read free editions
    if edition.modalidad == 'GRATUITA':
        return True

    # 3. Company permission (EDICION_VER)
    effective_perms = calculate_effective_permissions(user.id, edition.empresa_id)
    if 'EDICION_VER' in effective_perms:
        return True

    # 4. Active plan subscription check for regular readers
    from apps.purchases.services.purchase_service import get_user_active_subscription_details
    start_date, expiry_date = get_user_active_subscription_details(user)
    if expiry_date and edition.fecha_publicacion and start_date <= edition.fecha_publicacion <= expiry_date:
        return True

    # 4. Existing active AccesoEdicion record (individual purchase or manual grant)
    now = timezone.now()
    active_access = AccesoEdicion.objects.using('periodico_db').filter(
        usuario=user,
        edicion=edition,
        estado='ACTIVO',
        fecha_inicio__lte=now
    ).filter(
        models.Q(fecha_fin__isnull=True) | models.Q(fecha_fin__gt=now)
    ).exists()
    
    if active_access:
        return True

    return False


def get_or_create_reading_access(user, edition) -> AccesoEdicion:
    """
    Retrieves an active reading access for the user, or creates one if the user
    is authorized via free edition status or company permissions.
    """
    now = timezone.now()
    
    # 1. Search for existing active AccesoEdicion
    access = AccesoEdicion.objects.using('periodico_db').filter(
        usuario=user,
        edicion=edition,
        estado='ACTIVO',
        fecha_inicio__lte=now
    ).filter(
        models.Q(fecha_fin__isnull=True) | models.Q(fecha_fin__gt=now)
    ).first()
    
    if access:
        return access

    # 2. Free edition flow: auto-create GRATUITO access for any user
    if edition.modalidad == 'GRATUITA':
        try:
            tipo_gratuito = AccesoTipo.objects.using('periodico_db').get(id=2)
        except AccesoTipo.DoesNotExist:
            tipo_gratuito = AccesoTipo.objects.using('periodico_db').create(
                id=2, codigo='GRATUITO', nombre='Gratuito', estado='ACTIVO'
            )
        access, created = AccesoEdicion.objects.using('periodico_db').get_or_create(
            usuario=user,
            edicion=edition,
            tipo_acceso=tipo_gratuito,
            defaults={
                'fecha_inicio': now,
                'estado': 'ACTIVO',
                'origen_referencia': 'LECTURA_GRATUITA',
                'motivo': 'Acceso automático para edición gratuita.'
            }
        )
        return access

    # 3. Permissions-based / Admin bypass: auto-create ADMIN_TEMPORAL access (for paid editions)
    is_admin = user.is_superuser or getattr(user, 'usr_correo', '') == 'admin'
    effective_perms = calculate_effective_permissions(user.id, edition.empresa_id) if not is_admin else []
    has_perm = is_admin or 'EDICION_VER' in effective_perms

    if has_perm:
        try:
            tipo_admin = AccesoTipo.objects.using('periodico_db').get(id=5)
        except AccesoTipo.DoesNotExist:
            tipo_admin = AccesoTipo.objects.using('periodico_db').create(
                id=5, codigo='ADMIN_TEMPORAL', nombre='Acceso administrativo temporal', estado='ACTIVO'
            )
        access, created = AccesoEdicion.objects.using('periodico_db').get_or_create(
            usuario=user,
            edicion=edition,
            tipo_acceso=tipo_admin,
            defaults={
                'fecha_inicio': now,
                'estado': 'ACTIVO',
                'origen_referencia': 'PERMISO_VER',
                'motivo': 'Acceso automático para usuario con permisos de visualización o administrador.'
            }
        )
        return access

    # 4. Regular subscriber access flow (for paid editions)
    from apps.purchases.services.purchase_service import get_user_active_subscription_details
    start_date, expiry_date = get_user_active_subscription_details(user)
    if expiry_date and edition.fecha_publicacion and start_date <= edition.fecha_publicacion <= expiry_date:
        try:
            tipo_compra = AccesoTipo.objects.using('periodico_db').get(codigo='COMPRA', estado='ACTIVO')
        except AccesoTipo.DoesNotExist:
            tipo_compra = AccesoTipo.objects.using('periodico_db').create(
                id=1, codigo='COMPRA', nombre='Compra', estado='ACTIVO'
            )
        access, created = AccesoEdicion.objects.using('periodico_db').get_or_create(
            usuario=user,
            edicion=edition,
            tipo_acceso=tipo_compra,
            defaults={
                'fecha_inicio': now,
                'fecha_fin': expiry_date,
                'estado': 'ACTIVO',
                'origen_referencia': 'SUSCRIPCION_PLAN_AUTO',
                'motivo': f'Acceso automático por plan de suscripción activo iniciado en {start_date} con vencimiento {expiry_date}.'
            }
        )
        return access

    raise ValidationError("El usuario no tiene acceso a esta edición.")

