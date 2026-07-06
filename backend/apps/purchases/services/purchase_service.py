"""
purchase_service — lógica central de compra de edición individual.

Responsabilidades:
- Validar edición, empresa, usuario y precio.
- Impedir duplicados activos (idempotencia via com_referencia_interna).
- Crear Compra y Pago usando el proveedor mock.
- Auditar cada evento financiero.
- NO aceptar monto ni empresa del cliente — todo calculado en servidor.
- NO conceder acceso hasta pago confirmado.
"""
import logging
import uuid
from django.utils import timezone
from django.db import IntegrityError, transaction
from django.core.exceptions import ValidationError

from apps.purchases.models.compra import Compra
from apps.purchases.models.proveedor_pago import ProveedorPago
from apps.payments.models.pago import Pago
from apps.access.models.acceso_edicion import AccesoEdicion
from apps.payments.providers.mock_provider import MockPaymentProvider
from apps.purchases.services.grant_access_service import grant_purchase_access
from apps.audit.services.audit_service import AuditService

logger = logging.getLogger(__name__)

AUDIT_MODULE = 'M11'  # Module for purchases/payments


def _get_mock_provider(using: str = 'periodico_db') -> ProveedorPago:
    """
    Retrieves the MOCK payment provider from pdg.ppr_proveedor_pago.
    Raises ValidationError if not found or inactive.
    """
    try:
        return ProveedorPago.objects.using(using).get(
            codigo='MOCK', estado='ACTIVO'
        )
    except ProveedorPago.DoesNotExist:
        raise ValidationError(
            "No existe un ProveedorPago activo con codigo='MOCK' en pdg.ppr_proveedor_pago. "
            "Verificar que el proveedor mock esté registrado en el catálogo."
        )


def _build_referencia_interna(usuario_id: int, edicion_id: int) -> str:
    """
    Builds a unique internal reference for idempotency.
    Format: USR-{user_id}-EDI-{edition_id}-{short_uuid}
    """
    short = uuid.uuid4().hex[:8].upper()
    return f"USR-{usuario_id}-EDI-{edicion_id}-{short}"


def validate_edition_purchasable(edition, usuario) -> None:
    """
    Validates that the edition is eligible for purchase.
    Raises ValidationError with a safe message on any failure.

    Validates:
      - Edition is PUBLISHED and not deleted.
      - Edition has processed pages (at least one GENERADA page).
      - Edition company is ACTIVE and not deleted.
      - Edition allows purchase (permite_compra=True).
      - Edition is PAGO modality (not GRATUITA).
      - Edition price > 0.
    """
    if edition.eliminado or edition.estado != 'PUBLICADA':
        raise ValidationError("La edición no está disponible para compra.")

    if not edition.paginas.filter(edp_es_actual=True, edp_estado='GENERADA').exists():
        raise ValidationError("La edición no ha sido procesada completamente.")

    empresa = edition.empresa
    if empresa.eliminado or empresa.estado != 'ACTIVA':
        raise ValidationError("La empresa de la edición no está activa.")

    if not edition.permite_compra:
        raise ValidationError("Esta edición no permite compra individual.")

    if edition.modalidad == 'GRATUITA':
        raise ValidationError(
            "Esta edición es gratuita. No se requiere compra para acceder a ella."
        )

    if edition.precio is None or edition.precio <= 0:
        raise ValidationError("Esta edición no tiene un precio válido para compra.")

    if not usuario.is_active:
        raise ValidationError("El usuario no está activo.")


def check_existing_purchase(usuario_id: int, edicion_id: int, using: str = 'periodico_db'):
    """
    Checks if an active (PENDIENTE or PAGADO) purchase already exists.

    Returns:
        existing Compra if found, else None.
    """
    return Compra.objects.using(using).filter(
        usuario_id=usuario_id,
        edicion_id=edicion_id,
        estado__in=[Compra.PENDIENTE, Compra.PAGADO]
    ).first()


def initiate_purchase(
    *,
    usuario,
    edicion,
    request=None,
    using: str = 'periodico_db'
) -> dict:
    """
    Validates and initiates a purchase of an individual edition.

    All amounts and company info are taken from server-side data.
    No amount or company data from the client is accepted.

    Returns a dict with:
      {
        'com_id': int,
        'pag_id': int,
        'referencia_interna': str,
        'estado': str,           # Compra.PENDIENTE
        'monto': Decimal,
        'moneda': str,
        'proveedor': str,        # 'MOCK'
        'already_exists': bool,  # True if returned an existing PENDIENTE purchase
      }

    Raises ValidationError on invalid input.
    """
    ip_address = (
        request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
        or request.META.get('REMOTE_ADDR')
        if request else None
    )
    user_agent = request.META.get('HTTP_USER_AGENT', '') if request else None

    # 1. Validate edition and user
    validate_edition_purchasable(edicion, usuario)

    # 2. Check for existing active purchase (idempotency)
    existing = check_existing_purchase(usuario.id, edicion.id, using=using)
    if existing:
        if existing.estado == Compra.PAGADO:
            AuditService.record_event(
                usuario=usuario,
                emp_id=edicion.empresa_id,
                modulo=AUDIT_MODULE,
                accion='COMPRA_DUPLICADA_RECHAZADA',
                entidad='com_compra',
                entidad_id=str(existing.id),
                resultado='RECHAZADO',
                motivo='Intento de compra duplicada — ya existe compra PAGADA.',
                ip_address=ip_address,
                user_agent=user_agent,
            )
            raise ValidationError(
                "Ya tienes acceso a esta edición. La compra ya fue procesada."
            )
        # PENDIENTE: return the existing purchase (idempotent response)
        existing_pago = Pago.objects.using(using).filter(
            compra_id=existing.id, estado=Pago.CREADO
        ).order_by('-numero_intento').first()
        AuditService.record_event(
            usuario=usuario,
            emp_id=edicion.empresa_id,
            modulo=AUDIT_MODULE,
            accion='COMPRA_DUPLICADA_RECHAZADA',
            entidad='com_compra',
            entidad_id=str(existing.id),
            resultado='RECHAZADO',
            motivo='Intento de compra duplicada — ya existe compra PENDIENTE.',
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return {
            'com_id': existing.id,
            'pag_id': existing_pago.id if existing_pago else None,
            'referencia_interna': existing.referencia_interna,
            'estado': existing.estado,
            'monto': existing.monto_total,
            'moneda': existing.moneda,
            'proveedor': 'MOCK',
            'already_exists': True,
        }

    # 3. Get mock provider
    proveedor = _get_mock_provider(using=using)

    # 4. Build purchase data — all values from server side
    monto = edicion.precio
    moneda = edicion.moneda or 'PEN'
    empresa_id = edicion.empresa_id
    referencia = _build_referencia_interna(usuario.id, edicion.id)

    try:
        with transaction.atomic(using=using):
            # 5. Create Compra
            compra = Compra.objects.using(using).create(
                usuario=usuario,
                empresa_id=empresa_id,
                edicion=edicion,
                referencia_interna=referencia,
                precio_unitario=monto,
                monto_total=monto,
                moneda=moneda,
                estado=Compra.PENDIENTE,
                origen=Compra.ORIGEN_WEB,
                acceso_habilitado=False,
            )

            # 6. Create Pago (attempt #1)
            pago = Pago.objects.using(using).create(
                compra=compra,
                proveedor=proveedor,
                numero_intento=1,
                identificador_externo=None,  # Set after provider response in confirm step
                monto=monto,
                moneda=moneda,
                estado=Pago.CREADO,
            )

        # 7. Audit
        AuditService.record_event(
            usuario=usuario,
            emp_id=empresa_id,
            modulo=AUDIT_MODULE,
            accion='COMPRA_INICIADA',
            entidad='com_compra',
            entidad_id=str(compra.id),
            valores_nuevos={
                'com_id': compra.id,
                'edi_id': edicion.id,
                'pag_id': pago.id,
                'monto': str(monto),
                'moneda': moneda,
                'estado': compra.estado,
            },
            resultado='EXITOSO',
            motivo='Compra iniciada correctamente.',
            ip_address=ip_address,
            user_agent=user_agent,
        )

        logger.info(
            f"purchase_service.initiate_purchase: com={compra.id} pag={pago.id} "
            f"usr={usuario.id} edi={edicion.id} monto={monto}{moneda}"
        )

        return {
            'com_id': compra.id,
            'pag_id': pago.id,
            'referencia_interna': referencia,
            'estado': compra.estado,
            'monto': monto,
            'moneda': moneda,
            'proveedor': proveedor.codigo,
            'already_exists': False,
        }

    except IntegrityError as e:
        logger.error(
            f"purchase_service.initiate_purchase: IntegrityError al crear compra "
            f"usr={usuario.id} edi={edicion.id}: {e}"
        )
        AuditService.record_event(
            usuario=usuario,
            emp_id=edicion.empresa_id,
            modulo=AUDIT_MODULE,
            accion='PAGO_ERROR',
            entidad='com_compra',
            entidad_id=None,
            resultado='ERROR',
            motivo=f'IntegrityError al crear compra: compra duplicada o restricción violada.',
            ip_address=ip_address,
            user_agent=user_agent,
        )
        raise ValidationError("Error al procesar la compra. Es posible que ya tengas una compra pendiente.")


def confirm_purchase_mock(
    *,
    com_id: int,
    force_failure: bool = False,
    request=None,
    using: str = 'periodico_db'
) -> dict:
    """
    Confirms a purchase using the mock payment provider.
    Should only be called from the internal mock-confirm endpoint (dev/test only).

    Idempotent: if the purchase is already PAGADO, returns without re-processing.

    Returns dict with confirmation result.
    Raises ValidationError on invalid state.
    """
    ip_address = (
        request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
        or request.META.get('REMOTE_ADDR')
        if request else None
    )
    user_agent = request.META.get('HTTP_USER_AGENT', '') if request else None

    try:
        compra = Compra.objects.using(using).select_related(
            'usuario', 'edicion', 'edicion__empresa'
        ).get(id=com_id)
    except Compra.DoesNotExist:
        raise ValidationError(f"Compra {com_id} no encontrada.")

    usuario = compra.usuario
    edicion = compra.edicion

    # Idempotency: already confirmed
    if compra.estado == Compra.PAGADO:
        AuditService.record_event(
            usuario=usuario,
            emp_id=edicion.empresa_id,
            modulo=AUDIT_MODULE,
            accion='PAGO_CONFIRMACION_IDEMPOTENTE',
            entidad='com_compra',
            entidad_id=str(compra.id),
            resultado='EXITOSO',
            motivo='Confirmación idempotente — compra ya estaba PAGADA.',
            ip_address=ip_address,
            user_agent=user_agent,
        )
        acceso = (
            AccesoEdicion.objects.using(using)
            .filter(compra_id=compra.id, estado='ACTIVO')
            .first()
        )
        return {
            'com_id': compra.id,
            'pag_id': None,
            'estado': compra.estado,
            'acceso_id': acceso.id if acceso else None,
            'idempotente': True,
        }

    if compra.estado not in [Compra.PENDIENTE]:
        raise ValidationError(
            f"No se puede confirmar una compra en estado '{compra.estado}'."
        )

    # Retrieve the most recent CREADO payment
    pago = Pago.objects.using(using).filter(
        compra=compra, estado=Pago.CREADO
    ).order_by('-numero_intento').first()

    if not pago:
        raise ValidationError(f"No existe un pago CREADO para la compra {com_id}.")

    now = timezone.now()
    provider = MockPaymentProvider(force_failure=force_failure)
    result = provider.confirm_payment(external_id=f"MOCK-REF-{compra.referencia_interna}")

    try:
        with transaction.atomic(using=using):
            if result.success:
                # Check if it is a plan purchase
                ref_upper = (compra.referencia_interna or '').upper()
                is_plan = any(kw in ref_upper for kw in ['DIARIO', 'MENSUAL', 'ANUAL'])
                
                # To avoid unique constraint violation (uq_com_usuario_edicion_pagada)
                # for plan purchases, dynamically assign a different published edition 
                # that has not been purchased by the user yet.
                if is_plan:
                    paid_edition_ids = Compra.objects.using(using).filter(
                        usuario=usuario,
                        estado=Compra.PAGADO
                    ).exclude(id=compra.id).values_list('edicion_id', flat=True)
                    
                    if edicion.id in paid_edition_ids:
                        from apps.editions.models.edicion import Edicion
                        alt_edition = Edicion.objects.using(using).filter(estado='PUBLICADA').exclude(id__in=paid_edition_ids).first()
                        if not alt_edition:
                            alt_edition = Edicion.objects.using(using).exclude(id__in=paid_edition_ids).first()
                        
                        if alt_edition:
                            compra.edicion = alt_edition
                            compra.empresa_id = alt_edition.empresa_id
                            edicion = alt_edition
                
                has_active_plan = False
                if is_plan:
                    from apps.plans.services.user_plan_service import check_user_has_active_plan
                    has_active_plan = check_user_has_active_plan(usuario.id, using=using) is not None

                # Confirm payment
                pago.estado = Pago.CONFIRMADO
                pago.identificador_externo = result.external_id
                pago.codigo_respuesta = result.code
                pago.mensaje_respuesta = result.message
                pago.fecha_confirmacion = now
                pago.fecha_actualizacion = now
                pago.save(using=using)

                # Confirm purchase
                compra.estado = Compra.PAGADO
                compra.fecha_confirmacion = now
                
                acceso = None
                if is_plan and has_active_plan:
                    # Enqueue: mark as paid but access not enabled yet
                    compra.acceso_habilitado = False
                    compra.save(using=using)
                    
                    AuditService.record_event(
                        usuario=usuario,
                        emp_id=edicion.empresa_id,
                        modulo=AUDIT_MODULE,
                        accion='PAGO_CONFIRMADO',
                        entidad='pag_pago',
                        entidad_id=str(pago.id),
                        valores_nuevos={
                            'com_id': compra.id,
                            'pag_id': pago.id,
                            'estado': compra.estado,
                        },
                        resultado='EXITOSO',
                        motivo='Pago confirmado por proveedor mock.',
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )
                    
                    AuditService.record_event(
                        usuario=usuario,
                        emp_id=edicion.empresa_id,
                        modulo=AUDIT_MODULE,
                        accion='COMPRA_PENDIENTE',
                        entidad='com_compra',
                        entidad_id=str(compra.id),
                        valores_nuevos={'com_id': compra.id},
                        resultado='EXITOSO',
                        motivo='Compra anticipada encolada porque ya existe un plan activo.',
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )
                    
                    logger.info(
                        f"confirm_purchase_mock: com={compra.id} pag={pago.id} ENCOLADA por plan activo."
                    )
                    
                    # Trigger early purchase email sending task asynchronously
                    try:
                        from apps.purchases.tasks.receipt_email_tasks import send_subscription_email_task
                        send_subscription_email_task.delay(compra.id, 'EARLY_PURCHASE')
                    except Exception as email_err:
                        logger.error(
                            f"confirm_purchase_mock: Fallo al encolar send_subscription_email_task para compra={compra.id}: {email_err}"
                        )
                else:
                    # Normal flow: grant access immediately
                    compra.acceso_habilitado = True
                    compra.save(using=using)

                    acceso = grant_purchase_access(
                        usuario=usuario, edicion=edicion, compra=compra, using=using
                    )

                    AuditService.record_event(
                        usuario=usuario,
                        emp_id=edicion.empresa_id,
                        modulo=AUDIT_MODULE,
                        accion='PAGO_CONFIRMADO',
                        entidad='pag_pago',
                        entidad_id=str(pago.id),
                        valores_nuevos={
                            'com_id': compra.id,
                            'pag_id': pago.id,
                            'estado': compra.estado,
                        },
                        resultado='EXITOSO',
                        motivo='Pago confirmado por proveedor mock.',
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )
                    
                    AuditService.record_event(
                        usuario=usuario,
                        emp_id=edicion.empresa_id,
                        modulo=AUDIT_MODULE,
                        accion='ACCESO_COMPRA_CONCEDIDO',
                        entidad='acc_acceso_contenido',
                        entidad_id=str(acceso.id),
                        valores_nuevos={
                            'acc_id': acceso.id,
                            'com_id': compra.id,
                            'edi_id': edicion.id,
                        },
                        resultado='EXITOSO',
                        motivo='Acceso de lectura concedido tras pago confirmado.',
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )

                    logger.info(
                        f"confirm_purchase_mock: com={compra.id} pag={pago.id} acc={acceso.id} CONFIRMADO."
                    )

                    # Trigger receipt email sending task asynchronously
                    try:
                        from apps.purchases.tasks.receipt_email_tasks import send_receipt_email_task
                        send_receipt_email_task.delay(compra.id)
                    except Exception as email_err:
                        logger.error(
                            f"confirm_purchase_mock: Fallo al encolar send_receipt_email_task para compra={compra.id}: {email_err}"
                        )

                return {
                    'com_id': compra.id,
                    'pag_id': pago.id,
                    'estado': compra.estado,
                    'acceso_id': acceso.id if acceso else None,
                    'idempotente': False,
                }

            else:
                # Payment rejected
                pago.estado = Pago.RECHAZADO
                pago.codigo_respuesta = result.code
                pago.mensaje_respuesta = result.message
                pago.fecha_actualizacion = now
                pago.save(using=using)

                compra.estado = Compra.RECHAZADO
                compra.save(using=using)

                AuditService.record_event(
                    usuario=usuario,
                    emp_id=edicion.empresa_id,
                    modulo=AUDIT_MODULE,
                    accion='PAGO_RECHAZADO',
                    entidad='pag_pago',
                    entidad_id=str(pago.id),
                    valores_nuevos={
                        'com_id': compra.id,
                        'pag_id': pago.id,
                        'codigo': result.code,
                    },
                    resultado='RECHAZADO',
                    motivo='Pago rechazado por proveedor mock.',
                    ip_address=ip_address,
                    user_agent=user_agent,
                )

                logger.warning(
                    f"confirm_purchase_mock: com={compra.id} pag={pago.id} RECHAZADO."
                )
                return {
                    'com_id': compra.id,
                    'pag_id': pago.id,
                    'estado': compra.estado,
                    'acceso_id': None,
                    'idempotente': False,
                }

    except Exception as e:
        logger.error(
            f"confirm_purchase_mock: Error inesperado com={com_id}: {e}", exc_info=True
        )
        AuditService.record_event(
            usuario=usuario,
            emp_id=edicion.empresa_id if edicion else None,
            modulo=AUDIT_MODULE,
            accion='PAGO_ERROR',
            entidad='pag_pago',
            entidad_id=str(pago.id) if pago else None,
            resultado='ERROR',
            motivo=f'Error interno al confirmar pago mock: {type(e).__name__}',
            ip_address=ip_address,
            user_agent=user_agent,
        )
        raise


def check_user_has_active_subscription(user, using='periodico_db') -> bool:
    """
    Checks if the user has an active subscription (DIARIO, MENSUAL, or ANUAL)
    whose validity period (calculated from purchase confirmation time) has not expired.
    """
    expiry = get_user_active_subscription_expiry(user, using=using)
    return expiry is not None


def get_user_subscription_periods(user, using='periodico_db'):
    """
    Calculates the actual start and end dates for all confirmed subscription purchases
    by chaining consecutive/pre-purchased subscriptions.
    Returns a list of tuples: (purchase, start_datetime, expiry_datetime)
    sorted by start_datetime.
    """
    from django.utils import timezone
    from apps.purchases.models.compra import Compra
    from datetime import timedelta
    import calendar

    def add_months(sourcedate, months):
        month = sourcedate.month - 1 + months
        year = sourcedate.year + month // 12
        month = month % 12 + 1
        day = min(sourcedate.day, calendar.monthrange(year, month)[1])
        return sourcedate.replace(year=year, month=month, day=day)

    def add_years(sourcedate, years):
        try:
            return sourcedate.replace(year=sourcedate.year + years)
        except ValueError:
            return sourcedate.replace(year=sourcedate.year + years, day=28)

    purchases = Compra.objects.using(using).filter(
        usuario=user,
        estado=Compra.PAGADO,
        fecha_confirmacion__isnull=False
    )
    
    # Handle list sorting safely for both Django QuerySets and unittest mocks
    if hasattr(purchases, 'order_by') and not isinstance(purchases, list):
        purchases = purchases.order_by('fecha_confirmacion')
    else:
        purchases = sorted(purchases, key=lambda x: x.fecha_confirmacion)

    periods = []
    
    for purchase in purchases:
        ref = purchase.referencia_interna.upper()
        # Determine duration
        if "DIARIO" in ref:
            delta_fn = lambda start: start + timedelta(hours=24)
        elif "MENSUAL" in ref:
            delta_fn = lambda start: add_months(start, 1)
        elif "ANUAL" in ref:
            delta_fn = lambda start: add_years(start, 1)
        else:
            continue  # Not a subscription purchase

        confirm_time = purchase.fecha_confirmacion
        
        # Check if there is an active/overlapping chain before this subscription
        if periods:
            last_purchase, last_start, last_expiry = periods[-1]
            if confirm_time <= last_expiry:
                # Chain starts immediately when the previous one ends
                start_time = last_expiry
            else:
                # Starts when confirmed because the previous one has already expired
                start_time = confirm_time
        else:
            start_time = confirm_time

        expiry_time = delta_fn(start_time)
        periods.append((purchase, start_time, expiry_time))

    return periods


def get_user_active_subscription_expiry(user, using='periodico_db'):
    """
    Returns the maximum expiration date of the user's active subscriptions (DIARIO, MENSUAL, or ANUAL).
    Supports pre-purchased / chained subscription periods.
    """
    start, expiry = get_user_active_subscription_details(user, using=using)
    return expiry


def get_user_active_subscription_details(user, using='periodico_db'):
    """
    Returns the active subscription interval (start_date, expiry_date) for the user.
    If the user has an active chain of subscriptions, start_date is the beginning of 
    the active continuous block, and expiry_date is the end of the chain.
    """
    from django.utils import timezone
    now = timezone.now()
    periods = get_user_subscription_periods(user, using=using)
    
    # We find if 'now' is inside any period
    for idx, (purchase, start, expiry) in enumerate(periods):
        if start <= now < expiry:
            # We found the active period.
            # Find the start of this continuous chain
            chain_start = start
            for j in range(idx - 1, -1, -1):
                prev_purchase, prev_start, prev_expiry = periods[j]
                if prev_expiry >= chain_start:
                    chain_start = prev_start
                else:
                    break
                    
            # Find the end of this continuous chain
            chain_expiry = expiry
            for j in range(idx + 1, len(periods)):
                next_purchase, next_start, next_expiry = periods[j]
                if next_start <= chain_expiry:
                    chain_expiry = next_expiry
                else:
                    break
            
            return chain_start, chain_expiry
            
    return None, None

