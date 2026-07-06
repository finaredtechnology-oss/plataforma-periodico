from django.test import SimpleTestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from unittest.mock import MagicMock, patch
from datetime import timedelta
from contextlib import contextmanager
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework import status

from apps.accounts.models.usuario import Usuario
from apps.companies.models.empresa import Empresa
from apps.editions.models.edicion import Edicion
from apps.editions.models.edicion_archivo import EdicionArchivo
from apps.editions.models.edicion_historial import EdicionHistorial
from apps.editions.models.edicion_programacion import EdicionProgramacion
from apps.editions.constants import EstadoEdicion, EventoEdicionHistorial

@contextmanager
def dummy_atomic(*args, **kwargs):
    yield

class EditionsManagementTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        
        # Mock users
        self.superadmin = Usuario(id=1, usr_correo="admin@ejemplo.com", nombres="Super", apellidos="Admin", estado="ACTIVO", correo_verificado=True)
        self.editor = Usuario(id=2, usr_correo="editor@ejemplo.com", nombres="Editor", apellidos="User", estado="ACTIVO", correo_verificado=True)
        self.regular_user = Usuario(id=3, usr_correo="user@ejemplo.com", nombres="Regular", apellidos="User", estado="ACTIVO", correo_verificado=True)
        
        # Mock companies
        self.company = Empresa(id=10, razon_social="Empresa Test", ruc="20123456789", slug="empresa-test", estado="ACTIVA", eliminado=False)
        self.inactive_company = Empresa(id=11, razon_social="Empresa Inactiva", ruc="20123456788", slug="empresa-inactiva", estado="INACTIVA", eliminado=False)

        # Globally patch model saves to avoid database hits during SimpleTestCase runs
        self.patcher_ed_save = patch('apps.editions.models.edicion.Edicion.save')
        self.patcher_hist_save = patch('apps.editions.models.edicion_historial.EdicionHistorial.save')
        self.patcher_prog_save = patch('apps.editions.models.edicion_programacion.EdicionProgramacion.save')
        
        self.mock_ed_save = self.patcher_ed_save.start()
        self.mock_hist_save = self.patcher_hist_save.start()
        self.mock_prog_save = self.patcher_prog_save.start()

        # Globally patch get_company_active_plan
        self.patcher_active_plan = patch('apps.plans.selectors.plan_selectors.get_company_active_plan')
        self.mock_active_plan = self.patcher_active_plan.start()
        self.mock_active_plan.return_value = MagicMock()

        # Globally patch Empresa.objects.using
        self.patcher_emp_using = patch('apps.companies.models.empresa.Empresa.objects.using')
        self.mock_emp_using = self.patcher_emp_using.start()
        self.mock_emp_using.return_value.get.return_value = self.company

        # Globally patch Procesamiento.objects.using
        self.patcher_proc_using = patch('apps.processing.models.procesamiento.Procesamiento.objects.using')
        self.mock_proc_using = self.patcher_proc_using.start()
        self.mock_proc_using.return_value.filter.return_value.exists.return_value = True

        # Mock edition
        self.edition_draft = Edicion(
            id=100,
            empresa=self.company,
            codigo="EDI-001",
            titulo="Edición Especial",
            slug="edicion-especial",
            fecha_edicion=timezone.now().date(),
            modalidad="PAGO",
            precio=10.00,
            moneda="PEN",
            estado=EstadoEdicion.BORRADOR,
            creado_por=self.editor,
            eliminado=False
        )

        self.edition_published = Edicion(
            id=101,
            empresa=self.company,
            codigo="EDI-002",
            titulo="Edición Pública",
            slug="edicion-publica",
            fecha_edicion=timezone.now().date(),
            fecha_publicacion=timezone.now() - timedelta(hours=1),
            modalidad="GRATUITA",
            precio=0.00,
            moneda="PEN",
            estado=EstadoEdicion.PUBLICADA,
            creado_por=self.editor,
            eliminado=False
        )

        self.edition_suspended = Edicion(
            id=102,
            empresa=self.company,
            codigo="EDI-003",
            titulo="Edición Suspendida",
            slug="edicion-suspendida",
            fecha_edicion=timezone.now().date(),
            fecha_publicacion=timezone.now() - timedelta(hours=1),
            modalidad="PAGO",
            precio=15.00,
            moneda="PEN",
            estado=EstadoEdicion.SUSPENDIDA,
            creado_por=self.editor,
            eliminado=False
        )

        # Mock the reverse relationship of files at class level to avoid database queries when retrieving cover URLs in tests
        self.original_archivos_asociados = Edicion.archivos_asociados
        Edicion.archivos_asociados = MagicMock()
        Edicion.archivos_asociados.filter.return_value.select_related.return_value.first.return_value = None

    def tearDown(self):
        self.patcher_ed_save.stop()
        self.patcher_hist_save.stop()
        self.patcher_prog_save.stop()
        self.patcher_active_plan.stop()
        self.patcher_emp_using.stop()
        self.patcher_proc_using.stop()
        Edicion.archivos_asociados = self.original_archivos_asociados

    # 1. Validation Logic
    def test_validate_edition_data_success(self):
        from apps.editions.services.edition_create_service import validate_edition_data
        
        # Valid free edition
        data_free = {"modalidad": "GRATUITA", "precio": 0.00, "moneda": "PEN", "permite_muestra": False, "paginas_muestra": None}
        validate_edition_data(data_free)
        
        # Valid paid edition
        data_paid = {"modalidad": "PAGO", "precio": 12.50, "moneda": "USD", "permite_muestra": True, "paginas_muestra": 2}
        validate_edition_data(data_paid)

    def test_validate_edition_data_invalid_price(self):
        from apps.editions.services.edition_create_service import validate_edition_data
        
        # Free edition with price > 0
        with self.assertRaises(ValidationError):
            validate_edition_data({"modalidad": "GRATUITA", "precio": 5.00, "moneda": "PEN"})
            
        # Paid edition with price <= 0
        with self.assertRaises(ValidationError):
            validate_edition_data({"modalidad": "PAGO", "precio": 0.00, "moneda": "PEN"})

    def test_validate_edition_data_invalid_sample_pages(self):
        from apps.editions.services.edition_create_service import validate_edition_data
        
        # Sample allowed, but pages count is null
        with self.assertRaises(ValidationError):
            validate_edition_data({"modalidad": "PAGO", "precio": 10.00, "moneda": "PEN", "permite_muestra": True, "paginas_muestra": None})

        # Sample NOT allowed, but pages count is set
        with self.assertRaises(ValidationError):
            validate_edition_data({"modalidad": "PAGO", "precio": 10.00, "moneda": "PEN", "permite_muestra": False, "paginas_muestra": 5})

    # 2. Create Service
    @patch('apps.editions.services.edition_create_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_create_service.Empresa.objects.using')
    @patch('apps.editions.services.edition_create_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_create_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_create_service.AuditService.record_event')
    def test_create_edition_service_success(self, mock_audit, mock_hist_using, mock_edi_using, mock_emp_using, mock_atomic):
        # Mocks setup
        mock_emp_using.return_value.select_for_update.return_value.get.return_value = self.company
        mock_edi_using.return_value.filter.return_value.exists.return_value = False
        
        from apps.editions.services.edition_create_service import create_edition
        
        data = {
            "codigo": "NEW-01",
            "titulo": "Nueva Edición",
            "fecha_edicion": timezone.now().date(),
            "modalidad": "PAGO",
            "precio": 5.00,
            "moneda": "PEN"
        }
        
        edition = create_edition(empresa_id=10, creador=self.editor, data=data)
        self.assertEqual(edition.estado, EstadoEdicion.BORRADOR)
        self.assertEqual(edition.titulo, "Nueva Edición")
        self.assertEqual(edition.slug, "nueva-edicion")
        mock_audit.assert_called_once()

    # 3. Plan Limit Bypassed in Create
    @patch('apps.editions.services.edition_create_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_create_service.Empresa.objects.using')
    @patch('apps.editions.services.edition_create_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_create_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_create_service.AuditService.record_event')
    def test_create_edition_limit_bypassed(self, mock_audit, mock_hist_using, mock_edi_using, mock_emp_using, mock_atomic):
        mock_emp_using.return_value.select_for_update.return_value.get.return_value = self.company
        mock_edi_using.return_value.filter.return_value.exists.return_value = False
        
        from apps.editions.services.edition_create_service import create_edition
        
        data = {
            "codigo": "NEW-01",
            "titulo": "Nueva Edición",
            "fecha_edicion": timezone.now().date(),
            "modalidad": "PAGO",
            "precio": 5.00,
            "moneda": "PEN"
        }
        
        edition = create_edition(empresa_id=10, creador=self.editor, data=data)
        self.assertEqual(edition.estado, EstadoEdicion.BORRADOR)

    # 4. Update Service Whitelist and Immutability when Published
    @patch('apps.editions.services.edition_update_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_update_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_update_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_update_service.AuditService.record_event')
    def test_update_edition_draft_success(self, mock_audit, mock_hist_using, mock_edi_using, mock_atomic):
        mock_edi_using.return_value.select_for_update.return_value.get.return_value = self.edition_draft
        
        from apps.editions.services.edition_update_service import update_edition
        
        # Update title
        data = {"titulo": "Título Modificado"}
        
        edition = update_edition(company_id=10, edition_id=100, user=self.editor, data=data)
        self.assertEqual(edition.titulo, "Título Modificado")
        self.assertEqual(edition.actualizado_por, self.editor)
        mock_audit.assert_called_once()

    @patch('apps.editions.services.edition_update_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_update_service.Edicion.objects.using')
    def test_update_edition_published_immutable_fields(self, mock_edi_using, mock_atomic):
        mock_edi_using.return_value.select_for_update.return_value.get.return_value = self.edition_published
        
        from apps.editions.services.edition_update_service import update_edition
        
        # Attempt to change codigo and modalidad of published edition
        with self.assertRaises(ValidationError):
            update_edition(company_id=10, edition_id=101, user=self.editor, data={"codigo": "NEW-CODE"})

        with self.assertRaises(ValidationError):
            update_edition(company_id=10, edition_id=101, user=self.editor, data={"modalidad": "PAGO"})

    # 5. Schedule Service
    @patch('apps.editions.services.edition_schedule_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_schedule_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_schedule_service.Empresa.objects.using')
    @patch('apps.editions.services.edition_schedule_service.has_plan_feature', return_value=True)
    @patch('apps.editions.services.edition_schedule_service.EdicionProgramacion.objects.using')
    @patch('apps.editions.services.edition_schedule_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_schedule_service.AuditService.record_event')
    def test_schedule_publication_success(self, mock_audit, mock_hist, mock_prog, mock_feature, mock_emp, mock_edi, mock_atomic):
        self.edition_draft.estado = EstadoEdicion.PROCESADA
        mock_edi.return_value.select_for_update.return_value.get.return_value = self.edition_draft
        mock_emp.return_value.get.return_value = self.company
        
        # Mock any existing pending schedules
        mock_prog.return_value.filter.return_value = []

        from apps.editions.services.edition_schedule_service import schedule_publication
        
        future_date = timezone.now() + timedelta(days=5)
        edition = schedule_publication(
            company_id=10,
            edition_id=100,
            user=self.editor,
            scheduled_at=future_date
        )
        
        self.assertEqual(edition.estado, EstadoEdicion.PROGRAMADA)
        mock_prog.return_value.create.assert_called_once()
        mock_audit.assert_called_once()

    def test_schedule_publication_past_date(self):
        from apps.editions.services.edition_schedule_service import schedule_publication
        
        past_date = timezone.now() - timedelta(days=1)
        with self.assertRaises(ValidationError):
            schedule_publication(
                company_id=10,
                edition_id=100,
                user=self.editor,
                scheduled_at=past_date
            )

    # 6. Publish Service
    @patch('apps.editions.services.edition_publish_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_publish_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_publish_service.Empresa.objects.using')
    @patch('apps.editions.services.edition_publish_service.has_plan_feature', return_value=True)
    @patch('apps.editions.services.edition_publish_service.EdicionProgramacion.objects.using')
    @patch('apps.editions.services.edition_publish_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_publish_service.AuditService.record_event')
    def test_publish_edition_success(self, mock_audit, mock_hist, mock_prog, mock_feature, mock_emp, mock_edi, mock_atomic):
        self.edition_draft.estado = EstadoEdicion.PROCESADA
        mock_edi.return_value.select_for_update.return_value.get.return_value = self.edition_draft
        mock_emp.return_value.get.return_value = self.company
        mock_prog.return_value.filter.return_value = []

        from apps.editions.services.edition_publish_service import publish_edition
        
        edition = publish_edition(company_id=10, edition_id=100, user=self.editor)
        
        self.assertEqual(edition.estado, EstadoEdicion.PUBLICADA)
        self.assertIsNotNone(edition.fecha_publicacion)
        mock_audit.assert_called_once()

    # 7. Suspend Service
    @patch('apps.editions.services.edition_suspend_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_suspend_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_suspend_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_suspend_service.AuditService.record_event')
    def test_suspend_edition_success(self, mock_audit, mock_hist, mock_edi, mock_atomic):
        mock_edi.return_value.select_for_update.return_value.get.return_value = self.edition_published

        from apps.editions.services.edition_suspend_service import suspend_edition
        
        edition = suspend_edition(company_id=10, edition_id=101, user=self.editor, reason="Incumplimiento")
        
        self.assertEqual(edition.estado, EstadoEdicion.SUSPENDIDA)
        mock_audit.assert_called_once()

    # 8. Reactivate Service (clears publication date if returning to BORRADOR)
    @patch('apps.editions.services.edition_reactivate_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_reactivate_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_reactivate_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_reactivate_service.AuditService.record_event')
    def test_reactivate_edition_to_publicada(self, mock_audit, mock_hist, mock_edi, mock_atomic):
        mock_edi.return_value.select_for_update.return_value.get.return_value = self.edition_suspended

        from apps.editions.services.edition_reactivate_service import reactivate_edition
        
        edition = reactivate_edition(company_id=10, edition_id=102, user=self.editor, target_state="PUBLICADA")
        self.assertEqual(edition.estado, EstadoEdicion.PUBLICADA)
        self.assertIsNotNone(edition.fecha_publicacion)

    @patch('apps.editions.services.edition_reactivate_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_reactivate_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_reactivate_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_reactivate_service.AuditService.record_event')
    def test_reactivate_edition_to_borrador_clears_date(self, mock_audit, mock_hist, mock_edi, mock_atomic):
        mock_edi.return_value.select_for_update.return_value.get.return_value = self.edition_suspended

        from apps.editions.services.edition_reactivate_service import reactivate_edition
        
        edition = reactivate_edition(company_id=10, edition_id=102, user=self.editor, target_state="BORRADOR")
        self.assertEqual(edition.estado, EstadoEdicion.BORRADOR)
        self.assertIsNone(edition.fecha_publicacion)

    # 9. Celery scheduled tasks
    @patch('apps.editions.tasks.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.tasks.EdicionProgramacion.objects.using')
    @patch('apps.editions.tasks.Edicion.objects.using')
    @patch('apps.editions.tasks.publish_edition')
    @patch('apps.plans.services.plan_feature_service.has_plan_feature', return_value=True)
    def test_celery_publish_task(self, mock_has_feature, mock_publish, mock_edi, mock_sched, mock_atomic):
        sched_rec = EdicionProgramacion(id=500, edicion=self.edition_draft, estado='PENDIENTE', fecha_programada=timezone.now() - timedelta(minutes=5))
        mock_sched.return_value.filter.return_value.select_related.return_value = [sched_rec]
        mock_sched.return_value.select_for_update.return_value.get.return_value = sched_rec
        
        self.edition_draft.estado = EstadoEdicion.PROGRAMADA
        mock_edi.return_value.select_for_update.return_value.get.return_value = self.edition_draft

        from apps.editions.tasks import publish_scheduled_editions_task
        res = publish_scheduled_editions_task()
        
        self.assertEqual(res, "Processed 1 scheduled editions successfully.")
        mock_publish.assert_called_once_with(
            company_id=self.company.id,
            edition_id=self.edition_draft.id,
            proceso_origen='CELERY_TASK'
        )

    # 10. API View: GET /api/v1/companies/{emp_id}/editions/
    @patch('apps.editions.views.edition_views.get_company_editions')
    @patch('apps.authorization.permissions.drf_permissions.calculate_effective_permissions')
    @patch('apps.authorization.permissions.drf_permissions.get_user_company_relation')
    @patch('apps.authorization.permissions.drf_permissions.is_platform_superadmin', return_value=False)
    def test_api_list_editions(self, mock_super, mock_relation, mock_calc_perms, mock_editions_sel):
        mock_relation.return_value = MagicMock()
        mock_calc_perms.return_value = {'EDICION_VER'}
        
        mock_qs = MagicMock()
        mock_qs.order_by.return_value = [self.edition_draft]
        mock_editions_sel.return_value = mock_qs
        
        request = self.factory.get('/api/v1/companies/10/editions/')
        force_authenticate(request, user=self.editor)
        
        from apps.editions.views.edition_views import CompanyEditionListCreateView
        view = CompanyEditionListCreateView.as_view()
        response = view(request, emp_id=10)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should be paginated response
        self.assertIn("results", response.data)
        self.assertEqual(response.data["results"][0]["titulo"], "Edición Especial")

    # 11. API View IDOR check
    @patch('apps.authorization.permissions.drf_permissions.get_user_company_relation', return_value=None)
    @patch('apps.authorization.permissions.drf_permissions.is_platform_superadmin', return_value=False)
    def test_api_list_editions_idor_forbidden(self, mock_super, mock_relation):
        request = self.factory.get('/api/v1/companies/10/editions/')
        force_authenticate(request, user=self.regular_user) # regular user has no relation to company 10
        
        from apps.editions.views.edition_views import CompanyEditionListCreateView
        view = CompanyEditionListCreateView.as_view()
        response = view(request, emp_id=10)
        
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 12. Public API ListView and DetailView
    @patch('apps.editions.selectors.public_edition_selectors.Edicion.objects.using')
    def test_api_public_list(self, mock_edi_using):
        mock_edi_using.return_value.filter.return_value.select_related.return_value.order_by.return_value = [self.edition_published]
        
        request = self.factory.get('/api/v1/public/editions/')
        
        from apps.editions.views.public_views import PublicEditionListView
        view = PublicEditionListView.as_view()
        response = view(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["results"][0]["titulo"], "Edición Pública")

    @patch('apps.editions.selectors.public_edition_selectors.Edicion.objects.using')
    def test_api_public_detail_success(self, mock_edi_using):
        # Setup mock public query response
        mock_qs = MagicMock()
        mock_qs.get.return_value = self.edition_published
        mock_edi_using.return_value.filter.return_value.select_related.return_value = mock_qs
        
        request = self.factory.get('/api/v1/public/empresa-test/editions/edicion-publica/')
        
        from apps.editions.views.public_views import PublicEditionDetailView
        view = PublicEditionDetailView.as_view()
        response = view(request, company_slug="empresa-test", slug="edicion-publica")
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["titulo"], "Edición Pública")

    @patch('apps.editions.selectors.public_edition_selectors.Edicion.objects.using')
    def test_api_public_detail_not_found(self, mock_edi_using):
        # Make get raise DoesNotExist
        mock_qs = MagicMock()
        mock_qs.get.side_effect = Edicion.DoesNotExist
        mock_edi_using.return_value.filter.return_value.select_related.return_value = mock_qs
        
        request = self.factory.get('/api/v1/public/empresa-test/editions/edicion-oculta/')
        
        from apps.editions.views.public_views import PublicEditionDetailView
        view = PublicEditionDetailView.as_view()
        response = view(request, company_slug="empresa-test", slug="edicion-oculta")
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 13. Hardening verification tests
    def test_schedule_requires_procesada(self):
        from apps.editions.services.edition_schedule_service import schedule_publication
        self.edition_draft.estado = EstadoEdicion.BORRADOR
        future_date = timezone.now() + timedelta(days=5)
        
        with patch('apps.editions.services.edition_schedule_service.Edicion.objects.using') as mock_edi_using, \
             patch('apps.editions.services.edition_schedule_service.has_plan_feature', return_value=True), \
             patch('apps.editions.services.edition_schedule_service.transaction.atomic', side_effect=dummy_atomic), \
             patch('apps.editions.services.edition_schedule_service.AuditService.record_event') as mock_audit:
            mock_edi_using.return_value.select_for_update.return_value.get.return_value = self.edition_draft
            with self.assertRaises(ValidationError) as ctx:
                schedule_publication(
                    company_id=10,
                    edition_id=100,
                    user=self.editor,
                    scheduled_at=future_date
                )
            self.assertEqual(ctx.exception.code, "EDITION_NOT_PROCESSED")

    def test_publish_requires_procesada(self):
        from apps.editions.services.edition_publish_service import publish_edition
        self.edition_draft.estado = EstadoEdicion.BORRADOR
        
        with patch('apps.editions.services.edition_publish_service.Edicion.objects.using') as mock_edi_using, \
             patch('apps.editions.services.edition_publish_service.has_plan_feature', return_value=True), \
             patch('apps.editions.services.edition_publish_service.transaction.atomic', side_effect=dummy_atomic), \
             patch('apps.editions.services.edition_publish_service.AuditService.record_event') as mock_audit:
            mock_edi_using.return_value.select_for_update.return_value.get.return_value = self.edition_draft
            with self.assertRaises(ValidationError) as ctx:
                publish_edition(company_id=10, edition_id=100, user=self.editor)
            self.assertEqual(ctx.exception.code, "EDITION_NOT_PROCESSED")

    @patch('apps.editions.services.edition_reactivate_service.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.services.edition_reactivate_service.Edicion.objects.using')
    @patch('apps.editions.services.edition_reactivate_service.EdicionHistorial.objects.using')
    @patch('apps.editions.services.edition_reactivate_service.AuditService.record_event')
    def test_reactivate_fallback_to_borrador(self, mock_audit, mock_hist, mock_edi, mock_atomic):
        # Setup edition suspended but set global Procesamiento mock to return False for exists()
        self.mock_proc_using.return_value.filter.return_value.exists.return_value = False
        mock_edi.return_value.select_for_update.return_value.get.return_value = self.edition_suspended

        from apps.editions.services.edition_reactivate_service import reactivate_edition
        edition = reactivate_edition(company_id=10, edition_id=102, user=self.editor, target_state="PUBLICADA")
        self.assertEqual(edition.estado, EstadoEdicion.BORRADOR)
        self.assertIsNone(edition.fecha_publicacion)

    @patch('apps.editions.tasks.transaction.atomic', side_effect=dummy_atomic)
    @patch('apps.editions.tasks.EdicionProgramacion.objects.using')
    @patch('apps.editions.tasks.Edicion.objects.using')
    @patch('apps.editions.tasks.publish_edition')
    @patch('apps.plans.services.plan_feature_service.has_plan_feature', return_value=True)
    def test_celery_task_skips_if_not_processed(self, mock_has_feature, mock_publish, mock_edi, mock_sched, mock_atomic):
        # Force processing check to fail
        self.mock_proc_using.return_value.filter.return_value.exists.return_value = False
        sched_rec = EdicionProgramacion(id=500, edicion=self.edition_draft, estado='PENDIENTE', fecha_programada=timezone.now() - timedelta(minutes=5))
        mock_sched.return_value.filter.return_value.select_related.return_value = [sched_rec]
        mock_sched.return_value.select_for_update.return_value.get.return_value = sched_rec
        
        self.edition_draft.estado = EstadoEdicion.PROGRAMADA
        mock_edi.return_value.select_for_update.return_value.get.return_value = self.edition_draft

        from apps.editions.tasks import publish_scheduled_editions_task
        res = publish_scheduled_editions_task()
        self.assertEqual(res, "Processed 0 scheduled editions successfully.")
        mock_publish.assert_not_called()
        self.assertEqual(sched_rec.estado, 'VENCIDA')
        self.assertEqual(sched_rec.resultado, 'RECHAZADO')
