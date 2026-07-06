from django.db import transaction
from django.core.exceptions import ValidationError
from apps.audit.services.audit_service import AuditService
from apps.audit.constants import AuditoriaModulo, AuditoriaResultado
from apps.payments_methods_admin.models.payment_method import PaymentMethod

def create_payment_method(
    *,
    nombre: str,
    numero: str,
    qr: str = None,
    estado: str = 'ACTIVO',
    usuario,
    ip_address: str = None,
    user_agent: str = None
) -> PaymentMethod:
    """
    Creates a new payment method in the periodico_db database.
    Performs unique constraint checks and registers successful or failed audit logs.
    """
    nombre = nombre.strip()
    numero = numero.strip()

    if not nombre or not numero:
        raise ValidationError("El nombre del método y el número o referencia son requeridos.")

    import re
    if nombre.upper() in ['YAPE', 'PLIN']:
        if not re.match(r'^\d{9}$', numero):
            raise ValidationError("El número de celular para Yape o Plin debe tener exactamente 9 dígitos numéricos.")

    # Check for duplicates of (nombre, numero)
    if PaymentMethod.objects.using('periodico_db').filter(nombre__iexact=nombre, numero=numero).exists():
        raise ValidationError(f"Ya existe un método de pago '{nombre}' con el número/referencia '{numero}'.")

    try:
        with transaction.atomic(using='periodico_db'):
            pm = PaymentMethod.objects.using('periodico_db').create(
                nombre=nombre,
                numero=numero,
                qr=qr,
                estado=estado.upper()
            )

            # Record success audit log
            AuditService.record_event(
                usuario=usuario,
                modulo=AuditoriaModulo.M11,
                accion='METODO_PAGO_CREADO',
                entidad='pm_methods',
                entidad_id=str(pm.id),
                valores_nuevos={
                    'pm_id': pm.id,
                    'pm_name': pm.nombre,
                    'pm_number': pm.numero,
                    'pm_qr': pm.qr,
                    'pm_status': pm.estado
                },
                resultado=AuditoriaResultado.EXITOSO,
                ip_address=ip_address,
                user_agent=user_agent
            )
            return pm

    except Exception as e:
        # Record failure audit log
        AuditService.record_event(
            usuario=usuario,
            modulo=AuditoriaModulo.M11,
            accion='METODO_PAGO_CREADO_FALLIDO',
            entidad='pm_methods',
            valores_nuevos={
                'pm_name': nombre,
                'pm_number': numero,
                'pm_qr': qr,
                'pm_status': estado
            },
            resultado=AuditoriaResultado.ERROR,
            motivo=str(e),
            ip_address=ip_address,
            user_agent=user_agent
        )
        raise e


def update_payment_method(
    *,
    pm_id: int,
    nombre: str,
    numero: str,
    qr: str = None,
    estado: str,
    usuario,
    ip_address: str = None,
    user_agent: str = None
) -> PaymentMethod:
    """
    Updates an existing payment method.
    Checks for duplicates and logs audit information before saving.
    """
    nombre = nombre.strip()
    numero = numero.strip()

    if not nombre or not numero or not estado:
        raise ValidationError("El nombre, número/referencia y estado son requeridos.")

    import re
    if nombre.upper() in ['YAPE', 'PLIN']:
        if not re.match(r'^\d{9}$', numero):
            raise ValidationError("El número de celular para Yape o Plin debe tener exactamente 9 dígitos numéricos.")

    try:
        with transaction.atomic(using='periodico_db'):
            pm = PaymentMethod.objects.using('periodico_db').select_for_update().get(id=pm_id)

            # Check duplicate excluding current ID
            if PaymentMethod.objects.using('periodico_db').filter(nombre__iexact=nombre, numero=numero).exclude(id=pm_id).exists():
                raise ValidationError(f"Ya existe otro método de pago '{nombre}' con el número/referencia '{numero}'.")

            valores_anteriores = {
                'pm_id': pm.id,
                'pm_name': pm.nombre,
                'pm_number': pm.numero,
                'pm_qr': pm.qr,
                'pm_status': pm.estado
            }

            pm.nombre = nombre
            pm.numero = numero
            if qr is not None:
                pm.qr = qr
            pm.estado = estado.upper()
            pm.save(using='periodico_db')

            valores_nuevos = {
                'pm_id': pm.id,
                'pm_name': pm.nombre,
                'pm_number': pm.numero,
                'pm_qr': pm.qr,
                'pm_status': pm.estado
            }

            # Record success audit log
            AuditService.record_event(
                usuario=usuario,
                modulo=AuditoriaModulo.M11,
                accion='METODO_PAGO_ACTUALIZADO',
                entidad='pm_methods',
                entidad_id=str(pm.id),
                valores_anteriores=valores_anteriores,
                valores_nuevos=valores_nuevos,
                resultado=AuditoriaResultado.EXITOSO,
                ip_address=ip_address,
                user_agent=user_agent
            )
            return pm

    except PaymentMethod.DoesNotExist:
        raise ValidationError("El método de pago especificado no existe.")
    except Exception as e:
        # Record failure audit log
        AuditService.record_event(
            usuario=usuario,
            modulo=AuditoriaModulo.M11,
            accion='METODO_PAGO_ACTUALIZADO_FALLIDO',
            entidad='pm_methods',
            entidad_id=str(pm_id),
            resultado=AuditoriaResultado.ERROR,
            motivo=str(e),
            ip_address=ip_address,
            user_agent=user_agent
        )
        raise e


def delete_payment_method(
    *,
    pm_id: int,
    usuario,
    ip_address: str = None,
    user_agent: str = None
) -> None:
    """
    Deletes a payment method.
    Logs audit information before executing delete.
    """
    try:
        with transaction.atomic(using='periodico_db'):
            pm = PaymentMethod.objects.using('periodico_db').select_for_update().get(id=pm_id)

            valores_anteriores = {
                'pm_id': pm.id,
                'pm_name': pm.nombre,
                'pm_number': pm.numero,
                'pm_qr': pm.qr,
                'pm_status': pm.estado
            }

            pm.delete(using='periodico_db')

            # Record success audit log
            AuditService.record_event(
                usuario=usuario,
                modulo=AuditoriaModulo.M11,
                accion='METODO_PAGO_ELIMINADO',
                entidad='pm_methods',
                entidad_id=str(pm_id),
                valores_anteriores=valores_anteriores,
                resultado=AuditoriaResultado.EXITOSO,
                ip_address=ip_address,
                user_agent=user_agent
            )

    except PaymentMethod.DoesNotExist:
        raise ValidationError("El método de pago especificado no existe.")
    except Exception as e:
        # Record failure audit log
        AuditService.record_event(
            usuario=usuario,
            modulo=AuditoriaModulo.M11,
            accion='METODO_PAGO_ELIMINADO_FALLIDO',
            entidad='pm_methods',
            entidad_id=str(pm_id),
            resultado=AuditoriaResultado.ERROR,
            motivo=str(e),
            ip_address=ip_address,
            user_agent=user_agent
        )
        raise e
