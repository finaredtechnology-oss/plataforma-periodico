from django.test import SimpleTestCase
from django.core.exceptions import ValidationError
from unittest.mock import patch, MagicMock
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
import tempfile
import uuid
import os
from pathlib import Path

from apps.accounts.models.usuario import Usuario
from apps.companies.models.empresa import Empresa
from apps.editions.models.edicion import Edicion
from apps.editions.models.edicion_pagina import EdicionPagina
from apps.access.models.acceso_edicion import AccesoEdicion
from apps.access.models.acceso_tipo import AccesoTipo
from apps.reading.models.sesion_lectura import SesionLectura
from apps.reading.models.progreso_lectura import ProgresoLectura
from apps.files.models.archivo import Archivo


class DummyAtomic:
    def __init__(self, *args, **kwargs):
        pass
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_user(user_id=1, estado="ACTIVO"):
    u = Usuario(
        id=user_id,
        usr_correo=f"user{user_id}@example.com",
        nombres="John",
        apellidos="Doe",
        estado=estado,
        correo_verificado=True,
    )
    u.save = MagicMock()
    return u


def _make_company(company_id=10, estado="ACTIVA", eliminado=False):
    c = Empresa(
        id=company_id,
        ruc="12345678901",
        razon_social="Empresa Test",
        nombre_comercial="Empresa Test",
        slug="empresa-test",
        estado=estado,
        eliminado=eliminado,
    )
    c.save = MagicMock()
    return c


def _make_edition(edition_id=100, company=None, estado="PUBLICADA", eliminado=False,
                  modalidad="PAGO", numero_paginas=10,
                  permite_muestra=True, paginas_muestra=3):
    if company is None:
        company = _make_company()
    e = Edicion(
        id=edition_id,
        empresa=company,
        codigo="E01",
        titulo="Edicion Test",
        slug="edicion-test",
        fecha_edicion=timezone.now().date(),
        modalidad=modalidad,
        precio=10.00 if modalidad == "PAGO" else 0.00,
        moneda="PEN",
        numero_paginas=numero_paginas,
        estado=estado,
        creado_por=_make_user(),
        eliminado=eliminado,
        permite_muestra=permite_muestra,
        paginas_muestra=paginas_muestra,
    )
    e.save = MagicMock()
    return e


def _make_access(user, edition, access_id=55):
    tipo = AccesoTipo(id=1, codigo="COMPRA", nombre="Compra", estado="ACTIVO")
    tipo.save = MagicMock()
    acc = AccesoEdicion(
        id=access_id,
        usuario=user,
        edicion=edition,
        tipo_acceso=tipo,
        fecha_inicio=timezone.now() - timedelta(hours=1),
        estado="ACTIVO",
    )
    acc.save = MagicMock()
    return acc


def _make_session(user, edition, access, session_id=None, estado="ACTIVA",
                  hours_ago=0):
    sid = session_id or uuid.uuid4()
    s = SesionLectura(
        id=sid,
        usuario=user,
        edicion=edition,
        acceso=access,
        fecha_inicio=timezone.now() - timedelta(hours=hours_ago),
        pagina_inicio=1,
        pagina_fin=None,
        estado=estado,
    )
    s.save = MagicMock()
    return s


def _make_archivo(archivo_id=99, empresa_id=10, ruta="tenant_10/fake.jpg"):
    a = Archivo(
        id=archivo_id,
        empresa_id=empresa_id,
        nombre_original="fake.jpg",
        nombre_interno="fake.jpg",
        extension="jpg",
        tipo_mime="image/jpeg",
        tamano_bytes=1024,
        hash_sha256="abc123",
        ruta_storage=ruta,
        proveedor_storage="local",
        contenedor="private",
    )
    a.save = MagicMock()
    return a


def _make_page(edition, page_number=1, archivo=None, edp_es_muestra=False):
    if archivo is None:
        archivo = _make_archivo()
    p = EdicionPagina(
        id=777,
        edicion=edition,
        archivo=archivo,
        edp_numero_pagina=page_number,
        edp_es_actual=True,
        edp_estado="GENERADA",
        edp_es_muestra=edp_es_muestra,
    )
    p.save = MagicMock()
    return p


# ---------------------------------------------------------------------------
# Reading Session: Session Create Tests
# ---------------------------------------------------------------------------
@patch('django.db.transaction.atomic', DummyAtomic)
class ReadingSessionCreateViewTest(SimpleTestCase):

    def setUp(self):
        self.user = _make_user()
        self.company = _make_company()
        self.edition = _make_edition(company=self.company)
        self.access = _make_access(self.user, self.edition)
        self.session = _make_session(self.user, self.edition, self.access)

        self.original_paginas = Edicion.paginas
        Edicion.paginas = MagicMock()
        self.edition.paginas.filter.return_value.exists.return_value = True

    def tearDown(self):
        Edicion.paginas = self.original_paginas

    @patch('apps.reading.views.reading_session_views.can_user_read_edition')
    @patch('apps.reading.views.reading_session_views.get_or_create_reading_access')
    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.editions.models.edicion.Edicion.objects')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_create_session_success(self, mock_audit, mock_edi_obj, mock_sle_obj,
                                    mock_get_access, mock_can_read):
        """Session created successfully for authorized user."""
        mock_can_read.return_value = True
        mock_edi_obj.using.return_value.select_related.return_value.get.return_value = self.edition
        mock_get_access.return_value = self.access
        mock_sle_obj.using.return_value.create.return_value = self.session

        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.reading.views.reading_session_views import ReadingSessionCreateView
        factory = APIRequestFactory()
        request = factory.post(f'/api/v1/editions/{self.edition.id}/reading-session/')
        force_authenticate(request, user=self.user)
        response = ReadingSessionCreateView.as_view()(request, edi_id=self.edition.id)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('session_id', response.data)
        self.assertIn('expiration_time', response.data)
        mock_audit.assert_called_once()

    @patch('apps.reading.views.reading_session_views.can_user_read_edition')
    @patch('apps.editions.models.edicion.Edicion.objects')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_create_session_access_denied(self, mock_audit, mock_edi_obj, mock_can_read):
        """Session creation fails for unauthorized user."""
        mock_can_read.return_value = False
        mock_edi_obj.using.return_value.select_related.return_value.get.return_value = self.edition

        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.reading.views.reading_session_views import ReadingSessionCreateView
        factory = APIRequestFactory()
        request = factory.post(f'/api/v1/editions/{self.edition.id}/reading-session/')
        force_authenticate(request, user=self.user)
        response = ReadingSessionCreateView.as_view()(request, edi_id=self.edition.id)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        mock_audit.assert_called_once()

    @patch('apps.editions.models.edicion.Edicion.objects')
    def test_create_session_edition_not_found(self, mock_edi_obj):
        """Returns 404 if edition does not exist."""
        mock_edi_obj.using.return_value.select_related.return_value.get.side_effect = Edicion.DoesNotExist

        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.reading.views.reading_session_views import ReadingSessionCreateView
        factory = APIRequestFactory()
        request = factory.post('/api/v1/editions/9999/reading-session/')
        force_authenticate(request, user=self.user)
        response = ReadingSessionCreateView.as_view()(request, edi_id=9999)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Reading Session: Page Serving Tests
# ---------------------------------------------------------------------------
@patch('django.db.transaction.atomic', DummyAtomic)
class ReadingSessionPageViewTest(SimpleTestCase):

    def setUp(self):
        self.user = _make_user(user_id=1)
        self.company = _make_company(company_id=10)
        self.edition = _make_edition(company=self.company)
        self.access = _make_access(self.user, self.edition)
        self.session = _make_session(self.user, self.edition, self.access)
        self.session_id = self.session.id

        self.original_paginas = Edicion.paginas
        Edicion.paginas = MagicMock()
        self.edition.paginas.filter.return_value.exists.return_value = True

        self.temp_file = tempfile.NamedTemporaryFile(delete=False)
        self.temp_file.write(b"fake image data")
        self.temp_file.close()
        self.temp_file_path = Path(self.temp_file.name)
        self.responses_to_close = []

    def tearDown(self):
        Edicion.paginas = self.original_paginas
        for r in self.responses_to_close:
            try:
                r.close()
            except Exception:
                pass
        if os.path.exists(self.temp_file.name):
            try:
                os.unlink(self.temp_file.name)
            except Exception:
                pass

    def _get_page_view(self, session_id, page_number, user):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.reading.views.reading_session_views import ReadingSessionPageView
        factory = APIRequestFactory()
        request = factory.get(f'/api/v1/reading-sessions/{session_id}/pages/{page_number}/')
        force_authenticate(request, user=user)
        return ReadingSessionPageView.as_view()(request, session_id=session_id, page_number=page_number)

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.editions.models.edicion_pagina.EdicionPagina.objects')
    @patch('apps.files.services.storage_service.StorageService.get_private_absolute_path')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_serve_page_success(self, mock_audit, mock_path, mock_page_obj, mock_sle_obj):
        """Page served successfully via FileResponse for valid session."""
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session
        archivo = _make_archivo(empresa_id=10)
        page = _make_page(self.edition, archivo=archivo)
        mock_page_obj.using.return_value.select_related.return_value.get.return_value = page
        mock_path.return_value = self.temp_file_path

        response = self._get_page_view(self.session_id, 1, self.user)
        self.responses_to_close.append(response)

        self.assertTrue(hasattr(response, 'streaming_content'))
        mock_audit.assert_called_once()

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_serve_page_idor_cross_user(self, mock_audit, mock_sle_obj):
        """IDOR: user B cannot access user A's session."""
        other_user = _make_user(user_id=999)
        self.session.usuario_id = 999  # session belongs to user 999
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session

        response = self._get_page_view(self.session_id, 1, self.user)  # user 1 tries
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        mock_audit.assert_called_once()

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_serve_page_session_expired_by_time(self, mock_audit, mock_sle_obj):
        """Session expired (>2 hours): marks EXPIRADA and returns 403."""
        expired_session = _make_session(self.user, self.edition, self.access,
                                        hours_ago=5)
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = expired_session
        mock_sle_obj.using.return_value.select_for_update.return_value.get.return_value = expired_session

        response = self._get_page_view(self.session_id, 1, self.user)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(expired_session.estado, 'EXPIRADA')
        mock_audit.assert_called_once()

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    def test_serve_page_session_already_inactive(self, mock_sle_obj):
        """Session with estado != ACTIVA is rejected with 403."""
        finished_session = _make_session(self.user, self.edition, self.access,
                                         estado='FINALIZADA')
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = finished_session

        response = self._get_page_view(self.session_id, 1, self.user)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    def test_serve_page_edition_not_published(self, mock_sle_obj):
        """Rejects if edition is no longer PUBLICADA."""
        self.edition.estado = 'SUSPENDIDA'
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session

        response = self._get_page_view(self.session_id, 1, self.user)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    def test_serve_page_company_inactive(self, mock_sle_obj):
        """Rejects if company is inactive."""
        self.company.estado = 'INACTIVA'
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session

        response = self._get_page_view(self.session_id, 1, self.user)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    def test_serve_page_edition_deleted(self, mock_sle_obj):
        """Rejects if edition is soft-deleted."""
        self.edition.eliminado = True
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session

        response = self._get_page_view(self.session_id, 1, self.user)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.editions.models.edicion_pagina.EdicionPagina.objects')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_serve_page_cross_company_archivo(self, mock_audit, mock_page_obj, mock_sle_obj):
        """IDOR: blocks delivery if archivo.emp_id != edition.empresa_id (cross-company)."""
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session
        archivo = _make_archivo(empresa_id=999)  # different company
        page = _make_page(self.edition, archivo=archivo)
        mock_page_obj.using.return_value.select_related.return_value.get.return_value = page

        response = self._get_page_view(self.session_id, 1, self.user)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        mock_audit.assert_called_once()

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.editions.models.edicion_pagina.EdicionPagina.objects')
    @patch('apps.files.services.storage_service.StorageService.get_private_absolute_path')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_serve_page_path_traversal_blocked(self, mock_audit, mock_path, mock_page_obj, mock_sle_obj):
        """Path traversal attempt raises ValueError and returns 400."""
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session
        archivo = _make_archivo(empresa_id=10, ruta="../../../etc/passwd")
        page = _make_page(self.edition, archivo=archivo)
        mock_page_obj.using.return_value.select_related.return_value.get.return_value = page
        mock_path.side_effect = ValueError("path traversal")

        response = self._get_page_view(self.session_id, 1, self.user)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.editions.models.edicion_pagina.EdicionPagina.objects')
    @patch('apps.files.services.storage_service.StorageService.get_private_absolute_path')
    def test_serve_page_private_path_not_in_response(self, mock_path, mock_page_obj, mock_sle_obj):
        """The response must not contain any private storage path string."""
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session
        archivo = _make_archivo(empresa_id=10)
        page = _make_page(self.edition, archivo=archivo)
        mock_page_obj.using.return_value.select_related.return_value.get.return_value = page
        mock_path.return_value = self.temp_file_path

        with patch('apps.audit.services.audit_service.AuditService.record_event'):
            response = self._get_page_view(self.session_id, 1, self.user)

        self.responses_to_close.append(response)
        # Response should be FileResponse (binary), not a JSON with paths
        self.assertTrue(hasattr(response, 'streaming_content'))
        # Ensure response does NOT contain the storage key or absolute path
        if hasattr(response, 'data'):
            response_str = str(response.data)
            self.assertNotIn('tenant_10', response_str)
            self.assertNotIn('/private/', response_str)
            self.assertNotIn('storage', response_str.lower())

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.editions.models.edicion_pagina.EdicionPagina.objects')
    def test_serve_page_not_found_in_edition(self, mock_page_obj, mock_sle_obj):
        """Returns 404 if page does not exist in the edition."""
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session
        mock_page_obj.using.return_value.select_related.return_value.get.side_effect = EdicionPagina.DoesNotExist

        response = self._get_page_view(self.session_id, 999, self.user)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Reading Session: Progress Tests
# ---------------------------------------------------------------------------
@patch('django.db.transaction.atomic', DummyAtomic)
class ReadingSessionProgressViewTest(SimpleTestCase):

    def setUp(self):
        self.user = _make_user(user_id=1)
        self.company = _make_company(company_id=10)
        self.edition = _make_edition(company=self.company, numero_paginas=10)
        self.access = _make_access(self.user, self.edition)
        self.session = _make_session(self.user, self.edition, self.access)
        self.session_id = self.session.id

        self.original_paginas = Edicion.paginas
        Edicion.paginas = MagicMock()
        self.edition.paginas.filter.return_value.exists.return_value = True

    def tearDown(self):
        Edicion.paginas = self.original_paginas

    def _post_progress(self, session_id, user, page_number):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.reading.views.reading_session_views import ReadingSessionProgressView
        factory = APIRequestFactory()
        request = factory.post(
            f'/api/v1/reading-sessions/{session_id}/progress/',
            data={"page_number": page_number},
            format='json'
        )
        force_authenticate(request, user=user)
        return ReadingSessionProgressView.as_view()(request, session_id=session_id)

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.reading.models.progreso_lectura.ProgresoLectura.objects')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_progress_success(self, mock_audit, mock_prog_obj, mock_sle_obj):
        """Progress updated correctly with monotonic enforcement."""
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session
        mock_sle_obj.using.return_value.select_for_update.return_value.get.return_value = self.session

        progress = ProgresoLectura(id=888, usuario=self.user, edicion=self.edition,
                                   ultima_pagina=3)
        progress.save = MagicMock()
        mock_prog_obj.using.return_value.get_or_create.return_value = (progress, False)

        response = self._post_progress(self.session_id, self.user, 5)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(progress.ultima_pagina, 5)  # advanced
        self.assertEqual(float(progress.porcentaje), 50.0)
        mock_audit.assert_called_once()

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    @patch('apps.reading.models.progreso_lectura.ProgresoLectura.objects')
    @patch('apps.audit.services.audit_service.AuditService.record_event')
    def test_progress_monotonic_no_regression(self, mock_audit, mock_prog_obj, mock_sle_obj):
        """Progress cannot regress: page 8 cannot overwrite page 9."""
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session
        mock_sle_obj.using.return_value.select_for_update.return_value.get.return_value = self.session

        progress = ProgresoLectura(id=888, usuario=self.user, edicion=self.edition,
                                   ultima_pagina=9)
        progress.save = MagicMock()
        mock_prog_obj.using.return_value.get_or_create.return_value = (progress, False)

        response = self._post_progress(self.session_id, self.user, 3)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(progress.ultima_pagina, 9)  # stays at 9, no regression

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    def test_progress_idor_cross_user(self, mock_sle_obj):
        """User B cannot update User A's session progress."""
        other_user = _make_user(user_id=2)
        self.session.usuario_id = 99  # belongs to another user
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session

        response = self._post_progress(self.session_id, other_user, 5)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    def test_progress_session_expired(self, mock_sle_obj):
        """Cannot update progress if session is expired."""
        expired_session = _make_session(self.user, self.edition, self.access,
                                        hours_ago=5)
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = expired_session
        mock_sle_obj.using.return_value.select_for_update.return_value.get.return_value = expired_session

        with patch('apps.audit.services.audit_service.AuditService.record_event'):
            response = self._post_progress(self.session_id, self.user, 5)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(expired_session.estado, 'EXPIRADA')

    @patch('apps.reading.models.sesion_lectura.SesionLectura.objects')
    def test_progress_page_out_of_range(self, mock_sle_obj):
        """Cannot report progress beyond total pages."""
        mock_sle_obj.using.return_value.select_related.return_value.get.return_value = self.session

        response = self._post_progress(self.session_id, self.user, 999)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_progress_missing_page_number(self):
        """Returns 400 if page_number not provided."""
        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.reading.views.reading_session_views import ReadingSessionProgressView
        factory = APIRequestFactory()
        request = factory.post(f'/api/v1/reading-sessions/{self.session_id}/progress/',
                               data={}, format='json')
        force_authenticate(request, user=self.user)
        response = ReadingSessionProgressView.as_view()(request, session_id=self.session_id)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Public Sample View Tests
# ---------------------------------------------------------------------------
@patch('django.db.transaction.atomic', DummyAtomic)
class PublicSampleViewsTest(SimpleTestCase):

    def setUp(self):
        self.company = _make_company(company_id=10)
        self.user = _make_user()
        self.edition = _make_edition(
            company=self.company, estado="PUBLICADA",
            permite_muestra=True, paginas_muestra=3
        )

        self.original_paginas = Edicion.paginas
        Edicion.paginas = MagicMock()
        self.edition.paginas.filter.return_value.exists.return_value = True

        self.temp_file = tempfile.NamedTemporaryFile(delete=False)
        self.temp_file.write(b"fake sample page data")
        self.temp_file.close()
        self.temp_file_path = Path(self.temp_file.name)
        self.responses_to_close = []

    def tearDown(self):
        Edicion.paginas = self.original_paginas
        for r in self.responses_to_close:
            try:
                r.close()
            except Exception:
                pass
        if os.path.exists(self.temp_file.name):
            try:
                os.unlink(self.temp_file.name)
            except Exception:
                pass

    def _get_sample_page(self, page_number, company_slug='empresa-test',
                          edition_slug='edicion-test'):
        from rest_framework.test import APIRequestFactory
        from apps.reading.views.public_sample_views import PublicSamplePageView
        factory = APIRequestFactory()
        request = factory.get(
            f'/api/v1/public/editions/{company_slug}/{edition_slug}/sample/pages/{page_number}/'
        )
        return PublicSamplePageView.as_view()(
            request,
            company_slug=company_slug,
            edition_slug=edition_slug,
            page_number=page_number
        )

    @patch('apps.editions.models.edicion.Edicion.objects')
    @patch('apps.editions.models.edicion_pagina.EdicionPagina.objects')
    @patch('apps.files.services.storage_service.StorageService.get_private_absolute_path')
    def test_serve_sample_page_success(self, mock_path, mock_page_obj, mock_edi_obj):
        """Sample page served successfully within allowed range."""
        mock_edi_obj.using.return_value.select_related.return_value.get.return_value = self.edition
        archivo = _make_archivo(empresa_id=10)
        page = _make_page(self.edition, page_number=2, archivo=archivo, edp_es_muestra=True)
        mock_page_obj.using.return_value.select_related.return_value.get.return_value = page
        mock_path.return_value = self.temp_file_path

        response = self._get_sample_page(2)
        self.responses_to_close.append(response)

        self.assertTrue(hasattr(response, 'streaming_content'))

    @patch('apps.editions.models.edicion.Edicion.objects')
    def test_serve_sample_page_out_of_range(self, mock_edi_obj):
        """Request for page beyond paginas_muestra limit returns 403."""
        mock_edi_obj.using.return_value.select_related.return_value.get.return_value = self.edition

        response = self._get_sample_page(4)  # limit is 3
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.editions.models.edicion.Edicion.objects')
    def test_serve_sample_page_zero_page(self, mock_edi_obj):
        """Page 0 is invalid and returns 403."""
        mock_edi_obj.using.return_value.select_related.return_value.get.return_value = self.edition

        response = self._get_sample_page(0)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch('apps.editions.models.edicion.Edicion.objects')
    def test_serve_sample_page_muestra_disabled(self, mock_edi_obj):
        """Returns 403 if edition does not allow sample pages."""
        self.edition.permite_muestra = False
        mock_edi_obj.using.return_value.select_related.return_value.get.return_value = self.edition

        response = self._get_sample_page(1)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_serve_sample_edition_not_found(self):
        """Returns 404 if edition slug/company slug do not match a published edition."""
        with patch('apps.editions.models.edicion.Edicion.objects') as mock_edi_obj:
            mock_edi_obj.using.return_value.select_related.return_value.get.side_effect = Edicion.DoesNotExist

            response = self._get_sample_page(1, company_slug='no-exist', edition_slug='no-exist')
            self.responses_to_close.append(response)

            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch('apps.editions.models.edicion.Edicion.objects')
    def test_serve_sample_suspended_edition(self, mock_edi_obj):
        """Suspended edition is not found because query filters estado=PUBLICADA."""
        # In the view, the query includes estado='PUBLICADA', so suspended editions
        # raise DoesNotExist — simulated by side_effect
        mock_edi_obj.using.return_value.select_related.return_value.get.side_effect = Edicion.DoesNotExist

        response = self._get_sample_page(1)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch('apps.editions.models.edicion.Edicion.objects')
    def test_serve_sample_inactive_company(self, mock_edi_obj):
        """Inactive company's editions are not found (query filters empresa__estado=ACTIVA)."""
        mock_edi_obj.using.return_value.select_related.return_value.get.side_effect = Edicion.DoesNotExist

        response = self._get_sample_page(1)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch('apps.editions.models.edicion.Edicion.objects')
    @patch('apps.editions.models.edicion_pagina.EdicionPagina.objects')
    @patch('apps.files.services.storage_service.StorageService.get_private_absolute_path')
    def test_serve_sample_page_path_traversal_blocked(self, mock_path, mock_page_obj, mock_edi_obj):
        """Path traversal attempt raises ValueError and returns 400."""
        mock_edi_obj.using.return_value.select_related.return_value.get.return_value = self.edition
        archivo = _make_archivo(empresa_id=10, ruta="../../../etc/passwd")
        page = _make_page(self.edition, page_number=1, archivo=archivo, edp_es_muestra=True)
        mock_page_obj.using.return_value.select_related.return_value.get.return_value = page
        mock_path.side_effect = ValueError("path traversal")

        response = self._get_sample_page(1)
        self.responses_to_close.append(response)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('apps.editions.models.edicion.Edicion.objects')
    @patch('apps.editions.models.edicion_pagina.EdicionPagina.objects')
    @patch('apps.files.services.storage_service.StorageService.get_private_absolute_path')
    def test_serve_sample_page_private_path_not_exposed(self, mock_path, mock_page_obj, mock_edi_obj):
        """The public sample response must not contain storage keys or private paths."""
        mock_edi_obj.using.return_value.select_related.return_value.get.return_value = self.edition
        archivo = _make_archivo(empresa_id=10)
        page = _make_page(self.edition, page_number=1, archivo=archivo, edp_es_muestra=True)
        mock_page_obj.using.return_value.select_related.return_value.get.return_value = page
        mock_path.return_value = self.temp_file_path

        response = self._get_sample_page(1)
        self.responses_to_close.append(response)

        self.assertTrue(hasattr(response, 'streaming_content'))
        # No JSON body means no storage path exposed
        self.assertFalse(hasattr(response, 'data'))


# ---------------------------------------------------------------------------
# Library View: Additional Edge-case Tests
# ---------------------------------------------------------------------------
@patch('django.db.transaction.atomic', DummyAtomic)
@patch('apps.access.views.library_views.is_platform_superadmin')
@patch('apps.access.models.acceso_edicion.AccesoEdicion.objects')
@patch('apps.editions.models.edicion.Edicion.objects')
class LibraryListViewTest(SimpleTestCase):

    def setUp(self):
        self.databases = {'default', 'periodico_db'}
        self.user = _make_user()
        self.get_companies_patcher = patch(
            'apps.access.views.library_views.get_active_user_companies')
        self.mock_get_companies = self.get_companies_patcher.start()
        self.mock_get_companies.return_value = []

        self.calc_perms_patcher = patch(
            'apps.access.views.library_views.calculate_effective_permissions')
        self.mock_calc_perms = self.calc_perms_patcher.start()
        self.mock_calc_perms.return_value = set()

        self.sub_expiry_patcher = patch(
            'apps.purchases.services.purchase_service.get_user_active_subscription_details')
        self.mock_sub_expiry = self.sub_expiry_patcher.start()
        self.mock_sub_expiry.return_value = (None, None)

    def tearDown(self):
        self.get_companies_patcher.stop()
        self.calc_perms_patcher.stop()
        self.sub_expiry_patcher.stop()

    def _get_library(self, user):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from apps.access.views.library_views import LibraryListView
        factory = APIRequestFactory()
        request = factory.get('/api/v1/library/')
        force_authenticate(request, user=user)
        return LibraryListView.as_view()(request)

    def test_library_empty_no_access(self, mock_edi_obj, mock_acc_obj, mock_is_super):
        """Returns empty list when user has no accessible editions."""
        mock_is_super.return_value = False
        mock_acc_obj.using.return_value.filter.return_value.filter.return_value.values_list.return_value = []
        mock_edi_obj.using.return_value.select_related.return_value.filter.return_value.filter.return_value.distinct.return_value.order_by.return_value = []

        response = self._get_library(self.user)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_library_returns_accessible_editions(self, mock_edi_obj, mock_acc_obj, mock_is_super):
        """Returns published editions for user with active access."""
        mock_is_super.return_value = False
        mock_acc_obj.using.return_value.filter.return_value.filter.return_value.values_list.return_value = [100]
        self.mock_sub_expiry.return_value = (timezone.now() - timedelta(days=5), timezone.now() + timedelta(days=30))

        company = _make_company()
        edition = _make_edition(company=company)
        edition.fecha_publicacion = timezone.now()
        edition.es_destacada = False

        mock_edi_obj.using.return_value.select_related.return_value.filter.return_value.filter.return_value.distinct.return_value.order_by.return_value = [edition]

        response = self._get_library(self.user)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], 100)

    def test_library_requires_auth(self, mock_edi_obj, mock_acc_obj, mock_is_super):
        """Unauthenticated request to library returns 403."""
        from rest_framework.test import APIRequestFactory
        from apps.access.views.library_views import LibraryListView
        factory = APIRequestFactory()
        request = factory.get('/api/v1/library/')
        # No force_authenticate
        response = LibraryListView.as_view()(request)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])
