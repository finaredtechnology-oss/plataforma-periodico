from unittest.mock import MagicMock, patch
from django.test import SimpleTestCase
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APIRequestFactory

from apps.payments_methods_admin.models.payment_method import PaymentMethod
from apps.payments_methods_admin.serializers.payment_method_serializer import PaymentMethodSerializer
from apps.payments_methods_admin.services.payment_method_service import (
    create_payment_method,
    update_payment_method,
    delete_payment_method
)
from apps.payments_methods_admin.views.payment_method_views import (
    AdminPaymentMethodListView,
    AdminPaymentMethodDetailView,
    PublicPaymentMethodListView
)

class PaymentMethodsTest(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.mock_user = MagicMock()
        self.mock_user.id = 1
        self.mock_user.is_authenticated = True
        self.mock_user.is_active = True
        self.mock_user.usr_correo = 'admin'

    @patch('rest_framework.validators.UniqueTogetherValidator.__call__')
    def test_serializer_validation(self, mock_unique_check):
        """Test that the PaymentMethodSerializer correctly validates fields."""
        data = {
            'nombre': 'Yape',
            'numero': '987654321',
            'estado': 'ACTIVO',
            'qr': '/media/tenant_0/qr_test.png'
        }
        serializer = PaymentMethodSerializer(data=data)
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['nombre'], 'Yape')
        self.assertEqual(serializer.validated_data['numero'], '987654321')

    @patch('apps.payments_methods_admin.services.payment_method_service.transaction.atomic')
    @patch('apps.payments_methods_admin.services.payment_method_service.PaymentMethod.objects.using')
    @patch('apps.payments_methods_admin.services.payment_method_service.AuditService.record_event')
    def test_create_payment_method_service(self, mock_record_event, mock_db_using, mock_atomic):
        """Test service function for creating payment methods with audit logs."""
        mock_manager = MagicMock()
        mock_db_using.return_value = mock_manager
        
        # Simulate that no duplicate exists
        mock_manager.filter.return_value.exists.return_value = False
        
        # Simulate object creation
        mock_pm = MagicMock(spec=PaymentMethod)
        mock_pm.id = 5
        mock_pm.nombre = 'Yape'
        mock_pm.numero = '987654321'
        mock_pm.qr = '/media/tenant_0/qr_test.png'
        mock_pm.estado = 'ACTIVO'
        mock_manager.create.return_value = mock_pm
        
        pm = create_payment_method(
            nombre='Yape',
            numero='987654321',
            qr='/media/tenant_0/qr_test.png',
            estado='ACTIVO',
            usuario=self.mock_user,
            ip_address='127.0.0.1',
            user_agent='Mozilla/5.0'
        )
        
        self.assertEqual(pm.id, 5)
        self.assertEqual(pm.nombre, 'Yape')
        mock_manager.create.assert_called_once_with(
            nombre='Yape',
            numero='987654321',
            qr='/media/tenant_0/qr_test.png',
            estado='ACTIVO'
        )
        mock_record_event.assert_called_once()
        self.assertEqual(mock_record_event.call_args[1]['accion'], 'METODO_PAGO_CREADO')

    @patch('apps.payments_methods_admin.services.payment_method_service.PaymentMethod.objects.using')
    @patch('apps.payments_methods_admin.services.payment_method_service.AuditService.record_event')
    def test_create_duplicate_payment_method_raises_error(self, mock_record_event, mock_db_using):
        """Test that duplicate payment method inputs raise ValidationError."""
        mock_manager = MagicMock()
        mock_db_using.return_value = mock_manager
        
        # Simulate that duplicate exists
        mock_manager.filter.return_value.exists.return_value = True
        
        with self.assertRaises(ValidationError):
            create_payment_method(
                nombre='Yape',
                numero='987654321',
                usuario=self.mock_user
            )

    def test_invalid_wallet_phone_number_raises_error(self):
        """Test that invalid Yape/Plin phone numbers (length or characters) raise ValidationError."""
        with self.assertRaises(ValidationError):
            create_payment_method(
                nombre='Yape',
                numero='12345678',  # 8 digits (invalid)
                usuario=self.mock_user
            )
        with self.assertRaises(ValidationError):
            create_payment_method(
                nombre='Plin',
                numero='9876543210',  # 10 digits (invalid)
                usuario=self.mock_user
            )
        with self.assertRaises(ValidationError):
            create_payment_method(
                nombre='Yape',
                numero='98765432a',  # letters (invalid)
                usuario=self.mock_user
            )

    @patch('apps.payments_methods_admin.views.payment_method_views.get_all_payment_methods')
    def test_public_list_view(self, mock_get_all_methods):
        """Test the public view lists active methods and allows any request."""
        mock_pm = MagicMock(spec=PaymentMethod)
        mock_pm.id = 1
        mock_pm.nombre = 'Plin'
        mock_pm.numero = '999888777'
        mock_pm.qr = None
        mock_pm.estado = 'ACTIVO'
        mock_pm.created_at = '2026-07-02T12:00:00'
        mock_pm.updated_at = '2026-07-02T12:00:00'
        
        mock_get_all_methods.return_value = [mock_pm]
        
        request = self.factory.get('/api/v1/payments-methods/')
        view = PublicPaymentMethodListView.as_view()
        response = view(request)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['nombre'], 'Plin')
