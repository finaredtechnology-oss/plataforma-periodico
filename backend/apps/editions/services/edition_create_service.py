import re
from django.db import transaction, IntegrityError
from django.core.exceptions import ValidationError
from django.utils.text import slugify
from django.utils import timezone
from apps.companies.models.empresa import Empresa
from apps.accounts.models.usuario import Usuario
from apps.editions.models.edicion import Edicion
from apps.editions.models.edicion_historial import EdicionHistorial
from apps.editions.constants import EstadoEdicion, EventoEdicionHistorial
from apps.plans.services.plan_feature_service import has_plan_feature
from apps.plans.services.company_plan_service import assert_can_create_edition
from apps.audit.services.audit_service import AuditService
from apps.audit.constants import AuditoriaAccion, AuditoriaModulo, AuditoriaResultado

def normalize_slug(text: str) -> str:
    """
    Normalizes a text to be URL-safe.
    """
    return slugify(text)

def validate_edition_data(data: dict):
    """
    Validates physical constraints and logic in Python before writing to PostgreSQL.
    """
    # 1. Price vs Modality validation (ck_edi_precio)
    modalidad = data.get('modalidad', 'PAGO')
    if modalidad not in ['GRATUITA', 'PAGO']:
        raise ValidationError("La modalidad debe ser GRATUITA o PAGO.")

    precio = data.get('precio', 0)
    if modality_is_free := (modalidad == 'GRATUITA'):
        if precio != 0:
            raise ValidationError("Para ediciones GRATUITAS el precio debe ser 0.")
    else:
        if precio <= 0:
            raise ValidationError("Para ediciones de PAGO el precio debe ser mayor a 0.")

    # 2. Currency validation (ck_edi_moneda)
    moneda = data.get('moneda', 'PEN')
    if not re.match(r'^[A-Z]{3}$', moneda):
        raise ValidationError("La moneda debe ser un código de 3 letras mayúsculas (ISO 4217).")

    # 3. Sample pages validation (ck_edi_paginas_muestra)
    permite_muestra = data.get('permite_muestra', False)
    paginas_muestra = data.get('paginas_muestra')
    if permite_muestra:
        if paginas_muestra is None or paginas_muestra <= 0:
            raise ValidationError("Si permite muestra, la cantidad de páginas de muestra debe ser mayor a 0.")
    else:
        if paginas_muestra is not None:
            raise ValidationError("Si no permite muestra, la cantidad de páginas de muestra debe ser nula.")

    # 4. Total pages validation (ck_edi_numero_paginas)
    numero_paginas = data.get('numero_paginas')
    if numero_paginas is not None and numero_paginas <= 0:
        raise ValidationError("El número de páginas debe ser mayor a 0.")


def create_edition(*, empresa_id: int, creador: Usuario, data: dict, ip_address: str = None, user_agent: str = None) -> Edicion:
    """
    Creates a new edition in BORRADOR state.
    Enforces atomic transaction, select_for_update on the company for plan limits,
    checks plan features and monthly edition limit, and writes audit/history records.
    """
    # Run preliminary data validations
    validate_edition_data(data)

    # Use transactions on periodico_db
    with transaction.atomic(using='periodico_db'):
        # Lock company record to handle monthly edition limits concurrently
        try:
            company = Empresa.objects.using('periodico_db').select_for_update().get(id=empresa_id, eliminado=False)
        except Empresa.DoesNotExist:
            raise ValidationError("La empresa especificada no existe o fue eliminada.")


        # Handle slug creation/normalization
        raw_slug = data.get('slug')
        if not raw_slug:
            raw_slug = normalize_slug(data.get('titulo', ''))
        else:
            raw_slug = normalize_slug(raw_slug)

        if not raw_slug:
            raise ValidationError("No se pudo generar un slug válido para la edición.")

        # Ensure slug is unique per company (business-level check before DB save)
        if Edicion.objects.using('periodico_db').filter(empresa=company, slug=raw_slug, eliminado=False).exists():
            raise ValidationError("El slug ya está en uso para otra edición de esta empresa.")

        # Prepare edition details
        edition = Edicion(
            empresa=company,
            codigo=data.get('codigo'),
            titulo=data.get('titulo'),
            slug=raw_slug,
            descripcion_corta=data.get('descripcion_corta'),
            descripcion_larga=data.get('descripcion_larga'),
            fecha_edicion=timezone.now().date(),
            fecha_publicacion=None,
            modalidad=data.get('modalidad', 'PAGO'),
            precio=0,
            moneda='PEN',
            numero_paginas=data.get('numero_paginas'),
            es_destacada=data.get('es_destacada', False),
            permite_compra=data.get('permite_compra', True),
            permite_muestra=data.get('permite_muestra', False),
            paginas_muestra=data.get('paginas_muestra'),
            estado=EstadoEdicion.BORRADOR,
            creado_por=creador,
            actualizado_por=None,
            fecha_creacion=timezone.now(),
            fecha_actualizacion=None,
            eliminado=False
        )

        try:
            edition.save(using='periodico_db')
        except IntegrityError as ie:
            # Handle unique constraints on code/slug
            raise ValidationError("El código o slug de la edición ya existe para esta empresa.")

        # Create history record
        EdicionHistorial.objects.using('periodico_db').create(
            edicion=edition,
            tipo_evento=EventoEdicionHistorial.CREACION,
            estado_anterior=None,
            estado_nuevo=EstadoEdicion.BORRADOR,
            valores_anteriores=None,
            valores_nuevos={
                "codigo": edition.codigo,
                "titulo": edition.titulo,
                "slug": edition.slug,
                "modalidad": edition.modalidad,
                "precio": float(edition.precio),
                "moneda": edition.moneda,
                "estado": edition.estado
            },
            realizado_por=creador,
            direccion_ip=ip_address,
            resultado='EXITOSO'
        )

        # Record audit event
        AuditService.record_event(
            usuario=creador,
            emp_id=company.id,
            modulo=AuditoriaModulo.M05,
            accion=AuditoriaAccion.EDICION_CREADA,
            entidad="Edicion",
            entidad_id=str(edition.id),
            valores_nuevos={
                "id": edition.id,
                "titulo": edition.titulo,
                "slug": edition.slug,
                "codigo": edition.codigo
            },
            resultado=AuditoriaResultado.EXITOSO,
            ip_address=ip_address,
            user_agent=user_agent
        )

        return edition
