from django.db import transaction, IntegrityError
from django.core.exceptions import ValidationError
from django.utils import timezone
from apps.accounts.models.usuario import Usuario
from apps.editions.models.edicion import Edicion
from apps.editions.models.edicion_historial import EdicionHistorial
from apps.editions.constants import EstadoEdicion, EventoEdicionHistorial, UNEDITABLE_FIELDS_WHEN_PUBLISHED
from apps.editions.services.edition_create_service import validate_edition_data, normalize_slug
from apps.audit.services.audit_service import AuditService
from apps.audit.constants import AuditoriaAccion, AuditoriaModulo, AuditoriaResultado

def update_edition(*, company_id: int, edition_id: int, user: Usuario, data: dict, ip_address: str = None, user_agent: str = None) -> Edicion:
    """
    Updates an edition based on the whitelist of editable fields.
    Prevents modifying immutable columns, and blocks changes to sensitive fields for published editions.
    """
    with transaction.atomic(using='periodico_db'):
        try:
            edition = Edicion.objects.using('periodico_db').select_for_update().get(
                id=edition_id,
                empresa_id=company_id,
                eliminado=False
            )
        except Edicion.DoesNotExist:
            raise ValidationError("La edición especificada no existe o fue eliminada.")

        # Whitelist of fields that can be edited
        allowed_fields = {
            'titulo', 'descripcion_corta', 'descripcion_larga',
            'codigo', 'modalidad',
            'slug', 'numero_paginas', 'es_destacada', 'permite_compra',
            'permite_muestra', 'paginas_muestra'
        }

        # Identify which fields from the request data are in the whitelist and are actually changing
        updates = {}
        for field in allowed_fields:
            if field in data:
                val = data[field]
                current_val = getattr(edition, field)
                if current_val != val:
                    updates[field] = val

        if not updates:
            return edition

        # Enforce restrictions for published editions
        if edition.estado == EstadoEdicion.PUBLICADA:
            for field in updates:
                if field in UNEDITABLE_FIELDS_WHEN_PUBLISHED:
                    raise ValidationError(f"No se permite modificar el campo '{field}' en una edición PUBLICADA.")

        # Simulate update on a temporary dictionary to validate values before committing
        temp_data = {
            'modalidad': edition.modalidad,
            'precio': edition.precio,
            'moneda': edition.moneda,
            'permite_muestra': edition.permite_muestra,
            'paginas_muestra': edition.paginas_muestra,
            'numero_paginas': edition.numero_paginas
        }
        temp_data.update(updates)
        validate_edition_data(temp_data)

        # Handle slug change and normalization
        if 'slug' in updates:
            new_slug = normalize_slug(updates['slug'])
            if not new_slug:
                raise ValidationError("El slug provisto no es válido.")
            # Check unique slug per company
            if Edicion.objects.using('periodico_db').filter(
                empresa_id=company_id,
                slug=new_slug,
                eliminado=False
            ).exclude(id=edition_id).exists():
                raise ValidationError("El slug ya está en uso por otra edición de esta empresa.")
            updates['slug'] = new_slug

        # Keep values for history log
        valores_anteriores = {}
        valores_nuevos = {}

        # Apply updates
        for field, new_val in updates.items():
            old_val = getattr(edition, field)
            valores_anteriores[field] = float(old_val) if isinstance(old_val, (int, float)) and not isinstance(old_val, bool) else str(old_val) if old_val is not None else None
            valores_nuevos[field] = float(new_val) if isinstance(new_val, (int, float)) and not isinstance(new_val, bool) else str(new_val) if new_val is not None else None
            setattr(edition, field, new_val)

        edition.actualizado_por = user
        edition.fecha_actualizacion = timezone.now()

        try:
            edition.save(using='periodico_db')
        except IntegrityError:
            raise ValidationError("El código o slug de la edición ya existe para esta empresa.")

        # Determine history event (CAMBIO_PRECIO if price changed, else EDICION_DATOS)
        tipo_evento = EventoEdicionHistorial.EDICION_DATOS
        if 'precio' in updates or 'moneda' in updates:
            tipo_evento = EventoEdicionHistorial.CAMBIO_PRECIO

        # Create history record
        EdicionHistorial.objects.using('periodico_db').create(
            edicion=edition,
            tipo_evento=tipo_evento,
            estado_anterior=edition.estado,
            estado_nuevo=edition.estado,
            valores_anteriores=valores_anteriores,
            valores_nuevos=valores_nuevos,
            realizado_por=user,
            direccion_ip=ip_address,
            resultado='EXITOSO'
        )

        # Record audit event
        AuditService.record_event(
            usuario=user,
            emp_id=company_id,
            modulo=AuditoriaModulo.M05,
            accion=AuditoriaAccion.EDICION_ACTUALIZADA,
            entidad="Edicion",
            entidad_id=str(edition.id),
            valores_anteriores=valores_anteriores,
            valores_nuevos=valores_nuevos,
            resultado=AuditoriaResultado.EXITOSO,
            ip_address=ip_address,
            user_agent=user_agent
        )

        return edition
