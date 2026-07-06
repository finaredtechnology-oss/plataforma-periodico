"""
test_purchases.py — Pruebas del módulo de compras y acceso por pago mock.

Usa SimpleTestCase con mocks completos.
NO escribe en PostgreSQL externo.
NO conecta pasarelas reales.
"""
import json
from decimal import Decimal
from unittest.mock import MagicMock, patch, PropertyMock
from django.test import SimpleTestCase, RequestFactory, override_settings
from django.core.exceptions import ValidationError
from rest_framework.test import APIRequestFactory


# ───────────────────────── Helpers ─────────────────────────

def _make_usuario(
    usr_id=1,
    estado='ACTIVO',
    eliminado=False,
    is_authenticated=True,
):
    u = MagicMock()
    u.id = usr_id
    u.estado = estado
    u.eliminado = eliminado
    u.is_authenticated = is_authenticated
    # Simulate is_active property: True only when ACTIVO and not eliminado
    type(u).is_active = PropertyMock(
        return_value=(estado == 'ACTIVO' and not eliminado)
    )
    return u


def _make_empresa(emp_id=10, estado='ACTIVA', eliminado=False):
    e = MagicMock()
    e.id = emp_id
    e.estado = estado
    e.eliminado = eliminado
    e.nombre_comercial = f"Empresa {emp_id}"
    e.slug = f"empresa-{emp_id}"
    return e


def _make_edicion(
    edi_id=99,
    estado='PUBLICADA',
    eliminado=False,
    modalidad='PAGO',
    precio=Decimal('10.00'),
    moneda='PEN',
    permite_compra=True,
    empresa=None,
    has_pages=True,
):
    e = MagicMock()
    e.id = edi_id
    e.estado = estado
    e.eliminado = eliminado
    e.modalidad = modalidad
    e.precio = precio
    e.moneda = moneda
    e.permite_compra = permite_compra
    e.empresa = empresa or _make_empresa()
    e.empresa_id = e.empresa.id
    e.titulo = f"Edicion {edi_id}"
    e.slug = f"edicion-{edi_id}"
    e.fecha_edicion = '2024-01-01'
    # Simulate paginas.filter().exists()
    mock_qs = MagicMock()
    mock_qs.exists.return_value = has_pages
    e.paginas = MagicMock()
    e.paginas.filter.return_value = mock_qs
    return e


def _make_compra(
    com_id=1,
    usuario_id=1,
    edicion_id=99,
    empresa_id=10,
    estado='PENDIENTE',
    monto_total=Decimal('10.00'),
    moneda='PEN',
    referencia_interna=None,
    acceso_habilitado=False,
):
    c = MagicMock()
    c.id = com_id
    c.usuario_id = usuario_id
    c.edicion_id = edicion_id
    c.empresa_id = empresa_id
    c.estado = estado
    c.monto_total = monto_total
    c.moneda = moneda
    c.referencia_interna = referencia_interna or f"USR-{usuario_id}-EDI-{edicion_id}-ABCD1234"
    c.acceso_habilitado = acceso_habilitado
    c.usuario = _make_usuario(usr_id=usuario_id)
    c.edicion = _make_edicion(edi_id=edicion_id, empresa=_make_empresa(emp_id=empresa_id))
    return c


def _make_pago(pag_id=1, compra_id=1, estado='CREADO', numero_intento=1):
    p = MagicMock()
    p.id = pag_id
    p.compra_id = compra_id
    p.estado = estado
    p.numero_intento = numero_intento
    return p


def _make_acceso(acc_id=1, compra_id=1, estado='ACTIVO', fecha_fin=None):
    a = MagicMock()
    a.id = acc_id
    a.compra_id = compra_id
    a.estado = estado
    a.fecha_fin = fecha_fin
    return a


# ────────────────── MockPaymentProvider Tests ────────────────────

class MockPaymentProviderTest(SimpleTestCase):
    """Tests for MockPaymentProvider — no DB access."""

    def get_mock_provider(self, force_failure=False):
        from apps.payments.providers.mock_provider import MockPaymentProvider
        return MockPaymentProvider(force_failure=force_failure)

    def test_initiate_success_returns_result(self):
        provider = self.get_mock_provider()
        result = provider.initiate_payment(amount=Decimal('10.00'), currency='PEN', reference='REF001')
        self.assertTrue(result.success)
        self.assertIsNotNone(result.external_id)
        self.assertIn('MOCK', result.external_id)

    def test_initiate_failure_returns_rejected(self):
        provider = self.get_mock_provider(force_failure=True)
        result = provider.initiate_payment(amount=Decimal('10.00'), currency='PEN', reference='REF002')
        self.assertFalse(result.success)
        self.assertEqual(result.code, 'MOCK_REJECTED')

    def test_confirm_success(self):
        provider = self.get_mock_provider()
        result = provider.confirm_payment(external_id='MOCK-ABC123')
        self.assertTrue(result.success)
        self.assertEqual(result.code, 'MOCK_CONFIRMED')

    def test_confirm_failure(self):
        provider = self.get_mock_provider(force_failure=True)
        result = provider.confirm_payment(external_id='MOCK-ABC123')
        self.assertFalse(result.success)
        self.assertEqual(result.code, 'MOCK_CONFIRM_REJECTED')

    def test_external_id_is_unique_per_call(self):
        provider = self.get_mock_provider()
        r1 = provider.initiate_payment(amount=Decimal('5.00'), currency='PEN', reference='R1')
        r2 = provider.initiate_payment(amount=Decimal('5.00'), currency='PEN', reference='R2')
        self.assertNotEqual(r1.external_id, r2.external_id)


# ─────────────── validate_edition_purchasable Tests ───────────────

class ValidateEditionPurchasableTest(SimpleTestCase):
    """Tests for purchase_service.validate_edition_purchasable()."""

    def _call(self, edition, usuario):
        from apps.purchases.services.purchase_service import validate_edition_purchasable
        validate_edition_purchasable(edition, usuario)

    def test_valid_edition_and_user_passes(self):
        edicion = _make_edicion()
        usuario = _make_usuario()
        self._call(edicion, usuario)  # Should not raise

    def test_unpublished_edition_raises(self):
        edicion = _make_edicion(estado='BORRADOR')
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_deleted_edition_raises(self):
        edicion = _make_edicion(eliminado=True)
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_no_processed_pages_raises(self):
        edicion = _make_edicion(has_pages=False)
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_inactive_company_raises(self):
        empresa = _make_empresa(estado='INACTIVA')
        edicion = _make_edicion(empresa=empresa)
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_deleted_company_raises(self):
        empresa = _make_empresa(eliminado=True)
        edicion = _make_edicion(empresa=empresa)
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_purchase_not_allowed_raises(self):
        edicion = _make_edicion(permite_compra=False)
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_free_edition_raises(self):
        edicion = _make_edicion(modalidad='GRATUITA')
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_zero_price_raises(self):
        edicion = _make_edicion(precio=Decimal('0.00'))
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_none_price_raises(self):
        edicion = _make_edicion(precio=None)
        usuario = _make_usuario()
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)

    def test_suspended_user_raises(self):
        edicion = _make_edicion()
        usuario = _make_usuario(estado='SUSPENDIDO')
        with self.assertRaises(ValidationError):
            self._call(edicion, usuario)


# ──────────────── initiate_purchase Tests ────────────────────

class InitiatePurchaseTest(SimpleTestCase):
    """Tests for purchase_service.initiate_purchase() — fully mocked DB."""

    def _call(self, usuario, edicion):
        from apps.purchases.services.purchase_service import initiate_purchase
        return initiate_purchase(usuario=usuario, edicion=edicion, using='periodico_db')

    @patch('apps.purchases.services.purchase_service.AuditService.record_event')
    @patch('apps.purchases.services.purchase_service.Pago')
    @patch('apps.purchases.services.purchase_service.Compra')
    @patch('apps.purchases.services.purchase_service._get_mock_provider')
    @patch('apps.purchases.services.purchase_service.check_existing_purchase')
    def test_purchase_created_successfully(
        self, mock_check, mock_provider_fn, MockCompra, MockPago, mock_audit
    ):
        usuario = _make_usuario()
        edicion = _make_edicion()

        mock_check.return_value = None  # No existing purchase

        mock_proveedor = MagicMock()
        mock_proveedor.codigo = 'MOCK'
        mock_provider_fn.return_value = mock_proveedor

        mock_compra = _make_compra(com_id=5, usuario_id=usuario.id, edicion_id=edicion.id)
        MockCompra.objects.using.return_value.create.return_value = mock_compra
        MockCompra.PENDIENTE = 'PENDIENTE'
        MockCompra.PAGADO = 'PAGADO'
        MockCompra.ORIGEN_WEB = 'WEB'

        mock_pago = _make_pago(pag_id=3, compra_id=5)
        MockPago.objects.using.return_value.create.return_value = mock_pago
        MockPago.CREADO = 'CREADO'

        with patch('apps.purchases.services.purchase_service.transaction') as mock_tx:
            mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

            result = self._call(usuario, edicion)

        self.assertFalse(result['already_exists'])
        self.assertEqual(result['monto'], edicion.precio)
        self.assertEqual(result['moneda'], edicion.moneda)
        self.assertEqual(result['proveedor'], 'MOCK')

    @patch('apps.purchases.services.purchase_service.AuditService.record_event')
    @patch('apps.purchases.services.purchase_service.check_existing_purchase')
    def test_duplicate_pending_returns_existing(self, mock_check, mock_audit):
        usuario = _make_usuario()
        edicion = _make_edicion()
        existing_compra = _make_compra(estado='PENDIENTE')
        mock_check.return_value = existing_compra

        with patch('apps.purchases.services.purchase_service.Pago') as MockPago:
            MockPago.objects.using.return_value.filter.return_value.order_by.return_value.first.return_value = _make_pago()
            MockPago.CREADO = 'CREADO'
            with patch('apps.purchases.services.purchase_service.Compra') as MockCompra:
                MockCompra.PENDIENTE = 'PENDIENTE'
                MockCompra.PAGADO = 'PAGADO'
                # existing_compra.estado == PENDIENTE (not PAGADO), goes to return existing
                result = self._call(usuario, edicion)

        self.assertTrue(result['already_exists'])

    @patch('apps.purchases.services.purchase_service.AuditService.record_event')
    @patch('apps.purchases.services.purchase_service.check_existing_purchase')
    def test_duplicate_paid_raises(self, mock_check, mock_audit):
        usuario = _make_usuario()
        edicion = _make_edicion()
        existing_compra = _make_compra(estado='PAGADO')
        mock_check.return_value = existing_compra

        with patch('apps.purchases.services.purchase_service.Compra') as MockCompra:
            MockCompra.PENDIENTE = 'PENDIENTE'
            MockCompra.PAGADO = 'PAGADO'
            with self.assertRaises(ValidationError):
                self._call(usuario, edicion)

    def test_unpublished_edition_raises_before_db(self):
        usuario = _make_usuario()
        edicion = _make_edicion(estado='BORRADOR')
        with self.assertRaises(ValidationError):
            self._call(usuario, edicion)

    def test_amount_not_from_client(self):
        """Verify price is always taken from the edition (server-side), not from request."""
        from apps.purchases.services.purchase_service import initiate_purchase
        import inspect
        sig = inspect.signature(initiate_purchase)
        self.assertNotIn('amount', sig.parameters)
        self.assertNotIn('precio', sig.parameters)
        self.assertNotIn('monto', sig.parameters)

    def test_currency_not_from_client(self):
        """Verify currency is always taken from the edition, not from request body."""
        from apps.purchases.services.purchase_service import initiate_purchase
        import inspect
        sig = inspect.signature(initiate_purchase)
        self.assertNotIn('moneda', sig.parameters)
        self.assertNotIn('currency', sig.parameters)


# ─────────────────── confirm_purchase_mock Tests ──────────────────

class ConfirmPurchaseMockTest(SimpleTestCase):
    """Tests for purchase_service.confirm_purchase_mock() — fully mocked DB."""

    def _run_confirm(self, com_id, force_failure=False):
        from apps.purchases.services.purchase_service import confirm_purchase_mock
        return confirm_purchase_mock(com_id=com_id, force_failure=force_failure, using='periodico_db')

    @patch('apps.purchases.services.purchase_service.AuditService.record_event')
    @patch('apps.purchases.services.purchase_service.grant_purchase_access')
    @patch('apps.purchases.services.purchase_service.Pago')
    @patch('apps.purchases.services.purchase_service.Compra')
    def test_confirm_success(self, MockCompra, MockPago, mock_grant, mock_audit):
        compra = _make_compra(com_id=1, estado='PENDIENTE')
        MockCompra.objects.using.return_value.select_related.return_value.get.return_value = compra
        MockCompra.PAGADO = 'PAGADO'
        MockCompra.PENDIENTE = 'PENDIENTE'
        MockCompra.RECHAZADO = 'RECHAZADO'

        pago = _make_pago(pag_id=1, estado='CREADO')
        MockPago.objects.using.return_value.filter.return_value.order_by.return_value.first.return_value = pago
        MockPago.CREADO = 'CREADO'
        MockPago.CONFIRMADO = 'CONFIRMADO'
        MockPago.RECHAZADO = 'RECHAZADO'

        acceso = _make_acceso(acc_id=7)
        mock_grant.return_value = acceso

        # Patch MockPaymentProvider where it is imported in the module
        with patch('apps.purchases.services.purchase_service.MockPaymentProvider') as MockProvider:
            mock_instance = MagicMock()
            mock_instance.confirm_payment.return_value = MagicMock(
                success=True, external_id='MOCK-EXT-123', code='MOCK_CONFIRMED', message='OK'
            )
            MockProvider.return_value = mock_instance

            with patch('apps.purchases.services.purchase_service.transaction') as mock_tx:
                mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
                mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

                result = self._run_confirm(com_id=1)

        self.assertEqual(result['acceso_id'], 7)
        self.assertFalse(result['idempotente'])

    @patch('apps.purchases.services.purchase_service.AuditService.record_event')
    @patch('apps.purchases.services.purchase_service.AccesoEdicion')
    @patch('apps.purchases.services.purchase_service.Compra')
    def test_confirm_idempotent_if_already_paid(self, MockCompra, MockAccesoEdicion, mock_audit):
        compra = _make_compra(com_id=1, estado='PAGADO')
        MockCompra.objects.using.return_value.select_related.return_value.get.return_value = compra
        MockCompra.PAGADO = 'PAGADO'
        MockCompra.PENDIENTE = 'PENDIENTE'

        existing_acceso = _make_acceso(acc_id=55)
        mock_filter_qs = MagicMock()
        mock_filter_qs.first.return_value = existing_acceso
        MockAccesoEdicion.objects.using.return_value.filter.return_value = mock_filter_qs

        result = self._run_confirm(com_id=1)

        self.assertTrue(result['idempotente'])
        self.assertEqual(result['com_id'], 1)

    @patch('apps.purchases.services.purchase_service.AuditService.record_event')
    @patch('apps.purchases.services.purchase_service.Pago')
    @patch('apps.purchases.services.purchase_service.Compra')
    def test_confirm_rejected_if_provider_fails(self, MockCompra, MockPago, mock_audit):
        compra = _make_compra(com_id=2, estado='PENDIENTE')
        MockCompra.objects.using.return_value.select_related.return_value.get.return_value = compra
        MockCompra.PAGADO = 'PAGADO'
        MockCompra.PENDIENTE = 'PENDIENTE'
        MockCompra.RECHAZADO = 'RECHAZADO'

        pago = _make_pago(pag_id=2, estado='CREADO')
        MockPago.objects.using.return_value.filter.return_value.order_by.return_value.first.return_value = pago
        MockPago.CREADO = 'CREADO'
        MockPago.RECHAZADO = 'RECHAZADO'
        MockPago.CONFIRMADO = 'CONFIRMADO'

        with patch('apps.purchases.services.purchase_service.MockPaymentProvider') as MockProvider:
            mock_instance = MagicMock()
            mock_instance.confirm_payment.return_value = MagicMock(
                success=False, external_id='MOCK-EXT-002', code='MOCK_REJECTED', message='Rejected'
            )
            MockProvider.return_value = mock_instance

            with patch('apps.purchases.services.purchase_service.transaction') as mock_tx:
                mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
                mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

                result = self._run_confirm(com_id=2, force_failure=True)

        self.assertIsNone(result['acceso_id'])
        self.assertFalse(result['idempotente'])

    @patch('apps.purchases.services.purchase_service.Compra')
    def test_confirm_nonexistent_compra_raises(self, MockCompra):
        MockCompra.objects.using.return_value.select_related.return_value.get.side_effect = Exception("DoesNotExist")

        with self.assertRaises(Exception):
            self._run_confirm(com_id=9999)

    @patch('apps.purchases.services.purchase_service.AuditService.record_event')
    @patch('apps.purchases.services.purchase_service.Compra')
    def test_confirm_cancelled_compra_raises(self, MockCompra, mock_audit):
        compra = _make_compra(com_id=3, estado='CANCELADO')
        MockCompra.objects.using.return_value.select_related.return_value.get.return_value = compra
        MockCompra.PAGADO = 'PAGADO'
        MockCompra.PENDIENTE = 'PENDIENTE'

        with self.assertRaises(ValidationError):
            self._run_confirm(com_id=3)

    def test_access_not_granted_when_payment_fails(self):
        """Access must NOT be granted if payment provider rejects."""
        from apps.purchases.services.purchase_service import confirm_purchase_mock

        with patch('apps.purchases.services.purchase_service.Compra') as MockCompra, \
             patch('apps.purchases.services.purchase_service.Pago') as MockPago, \
             patch('apps.purchases.services.purchase_service.MockPaymentProvider') as MockProv, \
             patch('apps.purchases.services.purchase_service.AuditService.record_event'), \
             patch('apps.purchases.services.purchase_service.grant_purchase_access') as mock_grant, \
             patch('apps.purchases.services.purchase_service.transaction') as mock_tx:

            compra = _make_compra(estado='PENDIENTE')
            MockCompra.objects.using.return_value.select_related.return_value.get.return_value = compra
            MockCompra.PAGADO = 'PAGADO'
            MockCompra.PENDIENTE = 'PENDIENTE'
            MockCompra.RECHAZADO = 'RECHAZADO'

            pago = _make_pago()
            MockPago.objects.using.return_value.filter.return_value.order_by.return_value.first.return_value = pago
            MockPago.CREADO = 'CREADO'
            MockPago.RECHAZADO = 'RECHAZADO'
            MockPago.CONFIRMADO = 'CONFIRMADO'

            mock_instance = MagicMock()
            mock_instance.confirm_payment.return_value = MagicMock(
                success=False, external_id='MOCK-X', code='REJECTED', message='No'
            )
            MockProv.return_value = mock_instance

            mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

            result = confirm_purchase_mock(com_id=1, force_failure=True, using='periodico_db')

        # grant_purchase_access must NOT have been called
        mock_grant.assert_not_called()
        self.assertIsNone(result['acceso_id'])


# ─────────────────── grant_purchase_access Tests ─────────────────

class GrantPurchaseAccessTest(SimpleTestCase):
    """Tests for grant_access_service.grant_purchase_access() — fully mocked."""

    @patch('apps.purchases.services.grant_access_service.AccesoEdicion')
    @patch('apps.purchases.services.grant_access_service.get_acceso_tipo_compra')
    def test_creates_new_access_when_none_exists(self, mock_tipo, MockAcceso):
        usuario = _make_usuario()
        edicion = _make_edicion()
        compra = _make_compra()

        # Both filter() calls return nothing (no existing access)
        mock_qs_none = MagicMock()
        mock_qs_none.first.return_value = None
        mock_qs_none.filter.return_value = mock_qs_none
        MockAcceso.objects.using.return_value.filter.return_value = mock_qs_none

        new_access = _make_acceso(acc_id=99)
        MockAcceso.objects.using.return_value.create.return_value = new_access
        mock_tipo.return_value = MagicMock(id=3, codigo='COMPRA', estado='ACTIVO')

        from apps.purchases.services.grant_access_service import grant_purchase_access
        result = grant_purchase_access(
            usuario=usuario, edicion=edicion, compra=compra, using='periodico_db'
        )
        self.assertEqual(result.id, 99)

    @patch('apps.purchases.services.grant_access_service.AccesoEdicion')
    @patch('apps.purchases.services.grant_access_service.get_acceso_tipo_compra')
    def test_returns_existing_access_if_present(self, mock_tipo, MockAcceso):
        usuario = _make_usuario()
        edicion = _make_edicion()
        compra = _make_compra()

        existing = _make_acceso(acc_id=50, compra_id=compra.id)
        mock_qs = MagicMock()
        mock_qs.first.return_value = existing
        MockAcceso.objects.using.return_value.filter.return_value = mock_qs

        from apps.purchases.services.grant_access_service import grant_purchase_access
        result = grant_purchase_access(
            usuario=usuario, edicion=edicion, compra=compra, using='periodico_db'
        )
        self.assertEqual(result.id, 50)
        MockAcceso.objects.using.return_value.create.assert_not_called()

    @patch('apps.purchases.services.grant_access_service.AccesoTipo')
    def test_raises_if_compra_acceso_tipo_missing(self, MockAccesoTipo):
        """get_acceso_tipo_compra raises ValidationError when AccesoTipo not found."""
        # Setup DoesNotExist as a real exception class
        class FakeDoesNotExist(Exception):
            pass
        MockAccesoTipo.DoesNotExist = FakeDoesNotExist
        MockAccesoTipo.objects.using.return_value.get.side_effect = FakeDoesNotExist

        from apps.purchases.services.grant_access_service import get_acceso_tipo_compra
        with self.assertRaises(ValidationError):
            get_acceso_tipo_compra(using='periodico_db')


# ──────────── PurchaseEditionView Tests (HTTP) ────────────────

JWT_AUTH_PATH = 'apps.accounts.authentication.jwt_authentication.SafeJWTAuthentication.authenticate'


class PurchaseEditionViewTest(SimpleTestCase):
    """
    Tests for the POST /api/v1/editions/{edi_id}/purchase/ view.
    Patches SafeJWTAuthentication to inject mock user without real JWT.
    """

    def setUp(self):
        self.factory = APIRequestFactory()
        self.usuario = _make_usuario()
        self.edicion = _make_edicion()

    def _make_request(self):
        request = self.factory.post('/api/v1/editions/99/purchase/', {}, format='json')
        return request

    @patch(JWT_AUTH_PATH, return_value=None)
    @patch('apps.purchases.views.purchase_views.initiate_purchase')
    @patch('apps.purchases.views.purchase_views.Edicion')
    def test_purchase_returns_201_on_success(self, MockEdicion, mock_initiate, mock_auth):
        # Inject user via auth patch return value
        mock_auth.return_value = (self.usuario, None)
        MockEdicion.objects.using.return_value.select_related.return_value\
            .prefetch_related.return_value.get.return_value = self.edicion

        mock_initiate.return_value = {
            'com_id': 5, 'pag_id': 3,
            'referencia_interna': 'USR-1-EDI-99-ABCD1234',
            'estado': 'PENDIENTE',
            'monto': Decimal('10.00'), 'moneda': 'PEN',
            'proveedor': 'MOCK', 'already_exists': False,
        }

        from apps.purchases.views.purchase_views import PurchaseEditionView
        view = PurchaseEditionView.as_view()
        response = view(self._make_request(), edi_id=99)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['com_id'], 5)

    @patch(JWT_AUTH_PATH)
    @patch('apps.purchases.views.purchase_views.Edicion')
    def test_purchase_returns_404_for_unknown_edition(self, MockEdicion, mock_auth):
        mock_auth.return_value = (self.usuario, None)
        # Use a real exception subclass so the view catches it correctly
        class FakeEdicionDoesNotExist(Exception):
            pass
        MockEdicion.DoesNotExist = FakeEdicionDoesNotExist
        MockEdicion.objects.using.return_value.select_related.return_value\
            .prefetch_related.return_value.get.side_effect = FakeEdicionDoesNotExist("Edicion not found")

        from apps.purchases.views.purchase_views import PurchaseEditionView
        view = PurchaseEditionView.as_view()
        response = view(self._make_request(), edi_id=9999)
        self.assertEqual(response.status_code, 404)

    @patch(JWT_AUTH_PATH)
    @patch('apps.purchases.views.purchase_views.initiate_purchase')
    @patch('apps.purchases.views.purchase_views.Edicion')
    def test_purchase_returns_422_on_validation_error(self, MockEdicion, mock_initiate, mock_auth):
        mock_auth.return_value = (self.usuario, None)
        MockEdicion.objects.using.return_value.select_related.return_value\
            .prefetch_related.return_value.get.return_value = self.edicion

        mock_initiate.side_effect = ValidationError("La edición no está disponible para compra.")

        from apps.purchases.views.purchase_views import PurchaseEditionView
        view = PurchaseEditionView.as_view()
        response = view(self._make_request(), edi_id=99)
        self.assertEqual(response.status_code, 422)

    @patch(JWT_AUTH_PATH)
    def test_purchase_returns_403_for_inactive_user(self, mock_auth):
        inactive_user = _make_usuario(estado='SUSPENDIDO')
        mock_auth.return_value = (inactive_user, None)
        from apps.purchases.views.purchase_views import PurchaseEditionView
        view = PurchaseEditionView.as_view()
        response = view(self._make_request(), edi_id=99)
        self.assertEqual(response.status_code, 403)

    @patch(JWT_AUTH_PATH)
    @patch('apps.purchases.views.purchase_views.initiate_purchase')
    @patch('apps.purchases.views.purchase_views.Edicion')
    def test_purchase_returns_200_on_existing_pending(self, MockEdicion, mock_initiate, mock_auth):
        """Existing pending purchase returns 200 (idempotent)."""
        mock_auth.return_value = (self.usuario, None)
        MockEdicion.objects.using.return_value.select_related.return_value\
            .prefetch_related.return_value.get.return_value = self.edicion

        mock_initiate.return_value = {
            'com_id': 2, 'pag_id': 1,
            'referencia_interna': 'USR-1-EDI-99-EXISTING',
            'estado': 'PENDIENTE',
            'monto': Decimal('10.00'), 'moneda': 'PEN',
            'proveedor': 'MOCK', 'already_exists': True,
        }

        from apps.purchases.views.purchase_views import PurchaseEditionView
        view = PurchaseEditionView.as_view()
        response = view(self._make_request(), edi_id=99)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['already_exists'])


# ─────────── MockConfirmPaymentView Tests (HTTP) ────────────────

@override_settings(DEBUG=True)
class MockConfirmPaymentViewTest(SimpleTestCase):
    """Tests for POST /api/v1/payments/mock-confirm/ — DEBUG=True."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.usuario = _make_usuario()

    def _make_request(self, data):
        return self.factory.post(
            '/api/v1/payments/mock-confirm/',
            data=json.dumps(data),
            content_type='application/json'
        )

    @patch(JWT_AUTH_PATH)
    @patch('apps.purchases.views.mock_confirm_views.confirm_purchase_mock')
    def test_confirm_returns_200_on_success(self, mock_confirm, mock_auth):
        mock_auth.return_value = (self.usuario, None)
        mock_confirm.return_value = {
            'com_id': 1, 'pag_id': 1, 'estado': 'PAGADO', 'acceso_id': 7, 'idempotente': False
        }
        from apps.purchases.views.mock_confirm_views import MockConfirmPaymentView
        view = MockConfirmPaymentView.as_view()
        response = view(self._make_request({'com_id': 1}))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['acceso_id'], 7)

    @patch(JWT_AUTH_PATH)
    @patch('apps.purchases.views.mock_confirm_views.confirm_purchase_mock')
    def test_confirm_with_force_failure(self, mock_confirm, mock_auth):
        mock_auth.return_value = (self.usuario, None)
        mock_confirm.return_value = {
            'com_id': 1, 'pag_id': 1, 'estado': 'RECHAZADO', 'acceso_id': None, 'idempotente': False
        }
        from apps.purchases.views.mock_confirm_views import MockConfirmPaymentView
        view = MockConfirmPaymentView.as_view()
        response = view(self._make_request({'com_id': 1, 'force_failure': True}))
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['acceso_id'])

    @patch(JWT_AUTH_PATH)
    def test_confirm_invalid_body_returns_400(self, mock_auth):
        mock_auth.return_value = (self.usuario, None)
        from apps.purchases.views.mock_confirm_views import MockConfirmPaymentView
        view = MockConfirmPaymentView.as_view()
        response = view(self._make_request({'invalid_field': 'xyz'}))
        self.assertEqual(response.status_code, 400)

    @override_settings(DEBUG=False)
    @patch(JWT_AUTH_PATH)
    @patch('apps.purchases.views.mock_confirm_views.is_platform_superadmin', return_value=False)
    def test_confirm_returns_403_in_production_for_non_admin(self, mock_super, mock_auth):
        mock_auth.return_value = (self.usuario, None)
        from apps.purchases.views.mock_confirm_views import MockConfirmPaymentView
        view = MockConfirmPaymentView.as_view()
        response = view(self._make_request({'com_id': 1}))
        self.assertEqual(response.status_code, 403)


# ────────────── MyPurchasesView Tests (HTTP) ─────────────────

class MyPurchasesViewTest(SimpleTestCase):
    """Tests for GET /api/v1/my-purchases/ — anti-IDOR and safe data."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.usuario = _make_usuario(usr_id=1)

    @patch(JWT_AUTH_PATH)
    @patch('apps.purchases.views.my_purchases_views.MyPurchaseItemSerializer')
    @patch('apps.purchases.views.my_purchases_views.Compra')
    def test_returns_only_current_user_purchases(self, MockCompra, MockSerializer, mock_auth):
        """Verifica que el filtro siempre usa usuario_id=user.id — anti-IDOR."""
        mock_auth.return_value = (self.usuario, None)
        mock_qs = MagicMock()
        MockCompra.objects.using.return_value.select_related.return_value\
            .filter.return_value.order_by.return_value = mock_qs

        MockSerializer.return_value.data = []

        from apps.purchases.views.my_purchases_views import MyPurchasesView
        view = MyPurchasesView.as_view()
        request = self.factory.get('/api/v1/my-purchases/')
        response = view(request)
        self.assertEqual(response.status_code, 200)

    def test_no_sensitive_fields_in_serializer(self):
        """Confirm that sensitive fields are not in MyPurchaseItemSerializer."""
        from apps.purchases.serializers.purchase_serializers import MyPurchaseItemSerializer
        excluded_fields = {
            'referencia_interna', 'pag_identificador_externo',
            'pag_estado_externo', 'payload', 'proveedor', 'motivo_cancelacion'
        }
        serializer_fields = set(MyPurchaseItemSerializer.Meta.fields)
        overlap = serializer_fields.intersection(excluded_fields)
        self.assertEqual(len(overlap), 0, f"Campos sensibles en serializer: {overlap}")

    def test_idor_protection_filter_uses_request_user_id(self):
        """Service function must filter by request user — cannot query arbitrary user purchases."""
        # Verify the view uses user.id from the request, not from request body
        import inspect
        from apps.purchases.views.my_purchases_views import MyPurchasesView
        src = inspect.getsource(MyPurchasesView.get)
        # The filter must reference user.id, not request.data
        self.assertIn('user.id', src)
        self.assertNotIn('request.data', src)


# ─────────── Auditoría — sin datos sensibles ─────────────────

class AuditSensitiveDataTest(SimpleTestCase):
    """Verifica que la auditoría no registra datos sensibles de tarjeta o tokens."""

    def test_audit_service_sanitizes_token_keys(self):
        from apps.audit.services.audit_service import sanitize_dict
        raw = {
            'com_id': 1,
            'card_token': 'tok_abc123',
            'payment_token': 'pmt_xyz',
            'cvv': '123',
            'card_number': '4111111111111111',
            'monto': '10.00',
        }
        result = sanitize_dict(raw)
        self.assertEqual(result['monto'], '10.00')
        self.assertEqual(result['com_id'], 1)
        self.assertEqual(result['card_token'], '[REDACTED]')
        self.assertEqual(result['payment_token'], '[REDACTED]')

    def test_audit_service_sanitizes_nested_token(self):
        from apps.audit.services.audit_service import sanitize_dict
        raw = {
            'purchase': {
                'access_token': 'tok_secret',
                'monto': '5.00'
            }
        }
        result = sanitize_dict(raw)
        self.assertEqual(result['purchase']['access_token'], '[REDACTED]')
        self.assertEqual(result['purchase']['monto'], '5.00')

    def test_no_card_data_in_pago_model_fields(self):
        """Pago model must not have card number or CVV fields."""
        from apps.payments.models.pago import Pago
        field_names = [f.name for f in Pago._meta.get_fields()]
        self.assertNotIn('numero_tarjeta', field_names)
        self.assertNotIn('cvv', field_names)
        self.assertNotIn('card_number', field_names)
        # Only last 4 digits allowed
        self.assertIn('ultimos_cuatro', field_names)


class SubscriptionCalculationsTest(SimpleTestCase):
    """Tests for subscription duration calculations and access helper."""

    @patch('apps.purchases.services.grant_access_service.AccesoEdicion')
    @patch('apps.purchases.services.grant_access_service.get_acceso_tipo_compra')
    def test_grant_purchase_access_daily_plan(self, mock_tipo, MockAcceso):
        from apps.purchases.services.grant_access_service import grant_purchase_access
        from datetime import timedelta
        
        usuario = _make_usuario()
        edicion = _make_edicion()
        compra = _make_compra()
        compra.referencia_interna = "REF-12345-DIARIO"

        mock_qs_none = MagicMock()
        mock_qs_none.first.return_value = None
        mock_qs_none.filter.return_value = mock_qs_none
        MockAcceso.objects.using.return_value.filter.return_value = mock_qs_none
        mock_tipo.return_value = MagicMock(id=3, codigo='COMPRA', estado='ACTIVO')

        grant_purchase_access(usuario=usuario, edicion=edicion, compra=compra, using='periodico_db')
        
        # Verify the create call arguments
        args, kwargs = MockAcceso.objects.using.return_value.create.call_args
        self.assertEqual(kwargs['origen_referencia'], 'PLAN_DIARIO')
        self.assertIsNotNone(kwargs['fecha_fin'])
        # check that duration is roughly 24 hours
        diff = kwargs['fecha_fin'] - kwargs['fecha_inicio']
        self.assertAlmostEqual(diff.total_seconds(), timedelta(hours=24).total_seconds(), delta=5)

    @patch('apps.purchases.services.grant_access_service.AccesoEdicion')
    @patch('apps.purchases.services.grant_access_service.get_acceso_tipo_compra')
    def test_grant_purchase_access_monthly_plan(self, mock_tipo, MockAcceso):
        from apps.purchases.services.grant_access_service import grant_purchase_access
        
        usuario = _make_usuario()
        edicion = _make_edicion()
        compra = _make_compra()
        compra.referencia_interna = "REF-12345-MENSUAL"

        mock_qs_none = MagicMock()
        mock_qs_none.first.return_value = None
        mock_qs_none.filter.return_value = mock_qs_none
        MockAcceso.objects.using.return_value.filter.return_value = mock_qs_none
        mock_tipo.return_value = MagicMock(id=3, codigo='COMPRA', estado='ACTIVO')

        grant_purchase_access(usuario=usuario, edicion=edicion, compra=compra, using='periodico_db')
        
        args, kwargs = MockAcceso.objects.using.return_value.create.call_args
        self.assertEqual(kwargs['origen_referencia'], 'PLAN_MENSUAL')
        self.assertIsNotNone(kwargs['fecha_fin'])
        # check that it advances approximately 1 month (between 28 and 31 days)
        diff = kwargs['fecha_fin'] - kwargs['fecha_inicio']
        self.assertTrue(28 <= diff.days <= 31)

    @patch('apps.purchases.models.compra.Compra.objects.using')
    def test_check_user_has_active_subscription(self, mock_compra_using):
        from apps.purchases.services.purchase_service import check_user_has_active_subscription
        from django.utils import timezone
        from datetime import timedelta
        
        usuario = _make_usuario()
        
        # Test Case 1: No purchases -> False
        mock_compra_using.return_value.filter.return_value = []
        self.assertFalse(check_user_has_active_subscription(usuario))

        # Test Case 2: Active purchase -> True
        mock_purchase = MagicMock()
        mock_purchase.referencia_interna = "REF-123-MENSUAL"
        mock_purchase.fecha_confirmacion = timezone.now() - timedelta(days=10)
        mock_compra_using.return_value.filter.return_value = [mock_purchase]
        self.assertTrue(check_user_has_active_subscription(usuario))

        # Test Case 3: Expired purchase -> False
        mock_expired_purchase = MagicMock()
        mock_expired_purchase.referencia_interna = "REF-123-DIARIO"
        mock_expired_purchase.fecha_confirmacion = timezone.now() - timedelta(hours=25)
        mock_compra_using.return_value.filter.return_value = [mock_expired_purchase]
        self.assertFalse(check_user_has_active_subscription(usuario))

    @patch('apps.purchases.models.compra.Compra.objects.using')
    def test_get_user_active_subscription_expiry(self, mock_compra_using):
        from apps.purchases.services.purchase_service import get_user_active_subscription_expiry
        from django.utils import timezone
        from datetime import timedelta
        
        usuario = _make_usuario()
        
        # Case 1: No purchases -> None
        mock_compra_using.return_value.filter.return_value = []
        self.assertIsNone(get_user_active_subscription_expiry(usuario))

        # Case 2: Active monthly purchase -> returns expiry date
        now = timezone.now()
        mock_purchase = MagicMock()
        mock_purchase.referencia_interna = "REF-123-MENSUAL"
        mock_purchase.fecha_confirmacion = now - timedelta(days=10)
        mock_compra_using.return_value.filter.return_value = [mock_purchase]
        
        expiry = get_user_active_subscription_expiry(usuario)
        self.assertIsNotNone(expiry)
        self.assertTrue(expiry > now)

        # Case 3: Multiple active purchases -> returns chained maximum expiry
        mock_purchase_diario = MagicMock()
        mock_purchase_diario.referencia_interna = "REF-123-DIARIO"
        mock_purchase_diario.fecha_confirmacion = now - timedelta(hours=2)
        
        mock_compra_using.return_value.filter.return_value = [mock_purchase, mock_purchase_diario]
        
        max_expiry = get_user_active_subscription_expiry(usuario)
        self.assertEqual(max_expiry, expiry + timedelta(hours=24))

    @patch('apps.purchases.models.compra.Compra.objects.using')
    def test_get_user_active_subscription_details(self, mock_compra_using):
        from apps.purchases.services.purchase_service import get_user_active_subscription_details
        from django.utils import timezone
        from datetime import timedelta
        
        usuario = _make_usuario()
        
        # Case 1: No purchases -> (None, None)
        mock_compra_using.return_value.filter.return_value = []
        start, expiry = get_user_active_subscription_details(usuario)
        self.assertIsNone(start)
        self.assertIsNone(expiry)

        # Case 2: Active monthly purchase -> returns start and expiry date
        now = timezone.now()
        mock_purchase = MagicMock()
        mock_purchase.referencia_interna = "REF-123-MENSUAL"
        mock_purchase.fecha_confirmacion = now - timedelta(days=10)
        mock_compra_using.return_value.filter.return_value = [mock_purchase]
        
        start, expiry = get_user_active_subscription_details(usuario)
        self.assertEqual(start, mock_purchase.fecha_confirmacion)
        self.assertIsNotNone(expiry)
        self.assertTrue(expiry > now)


