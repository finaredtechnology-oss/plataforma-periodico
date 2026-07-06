from django.test import SimpleTestCase
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch, MagicMock
from rest_framework.exceptions import ValidationError
from apps.accounts.models.usuario import Usuario
from apps.accounts.models.verificacion_correo import VerificacionCorreo
from apps.accounts.constants import EstadoUsuario, EstadoVerificacion
from apps.accounts.serializers.register import UserRegisterSerializer
from apps.accounts.serializers.verify import EmailVerifySerializer
from apps.accounts.services.register_service import register_user
from apps.accounts.services.verification_service import verify_email
from apps.accounts.utils.log_utils import mask_email
from apps.configuration.selectors.parametro_selectors import get_system_parameter_value
import uuid

class DummyAtomic:
    def __init__(self, *args, **kwargs):
        pass
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_val, exc_tb):
        return False

@patch('django.db.transaction.atomic', DummyAtomic)
class RegistrationFlowTest(SimpleTestCase):
    def setUp(self):
        super().setUp()
        self.audit_patcher = patch('apps.audit.services.audit_service.AuditService.record_event')
        self.mock_record_event = self.audit_patcher.start()

    def tearDown(self):
        self.audit_patcher.stop()
        super().tearDown()
    
    @patch('apps.accounts.serializers.register.validate_password')
    def test_register_serializer_validation_success(self, mock_validate_pw):
        """
        Verify validation success for normal inputs.
        """
        mock_validate_pw.return_value = None
        data_valid = {
            "email": "test@example.com",
            "password": "validpassword123",
            "nombres": "John",
            "apellidos": "Doe"
        }
        serializer = UserRegisterSerializer(data=data_valid)
        self.assertTrue(serializer.is_valid())

    @patch('apps.accounts.serializers.register.validate_password')
    def test_register_serializer_password_validators(self, mock_validate_pw):
        """
        Verify register serializer runs django's validate_password helper and fails when weak.
        """
        from django.core.exceptions import ValidationError as DjangoValidationError
        mock_validate_pw.side_effect = DjangoValidationError("Contraseña muy común o simple.")
        
        data_invalid = {
            "email": "test@example.com",
            "password": "commonpassword",
            "nombres": "John"
        }
        serializer = UserRegisterSerializer(data=data_invalid)
        self.assertFalse(serializer.is_valid())
        self.assertIn("password", serializer.errors)

    @patch('django.db.transaction.on_commit')
    @patch('apps.accounts.services.register_service.send_verification_email')
    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.save')
    @patch('apps.accounts.models.usuario.Usuario.save')
    @patch('apps.accounts.models.usuario.Usuario.objects.using')
    def test_register_user_success_creation(self, mock_user_using, mock_user_save, mock_verification_save, mock_send_email, mock_on_commit):
        """
        Verify normal user registration creates PENDIENTE user, token and registers on_commit email.
        """
        # Set up mocks
        mock_user_using.return_value.filter.return_value.first.return_value = None
        mock_user_using.return_value.filter.return_value.exists.return_value = False
        
        user = register_user(
            email="newuser@example.com",
            password="securepassword123",
            nombres="Jane",
            apellidos="Doe",
            ip_address="127.0.0.1"
        )
        
        self.assertEqual(user.usr_correo, "newuser@example.com")
        self.assertEqual(user.estado, EstadoUsuario.PENDIENTE)
        self.assertFalse(user.correo_verificado)
        
        # Verify db saves were called
        mock_user_save.assert_called_once()
        mock_verification_save.assert_called_once()
        # transaction.on_commit must be used to defer Celery trigger
        mock_on_commit.assert_called_once()

    @patch('django.db.transaction.on_commit')
    @patch('apps.accounts.services.register_service.send_verification_email')
    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.save')
    @patch('apps.accounts.models.usuario.Usuario.save')
    @patch('apps.accounts.models.usuario.Usuario.objects.using')
    def test_register_duplicate_active_user_policy(self, mock_user_using, mock_user_save, mock_verification_save, mock_send_email, mock_on_commit):
        """
        Policy: If user is ACTIVO, register_user raises ValidationError.
        """
        mock_active_user = Usuario(usr_correo="active@example.com", estado=EstadoUsuario.ACTIVO)
        mock_user_using.return_value.filter.return_value.first.return_value = mock_active_user
        
        with self.assertRaises(ValidationError) as context:
            register_user(
                email="active@example.com",
                password="securepassword123",
                nombres="Jane"
            )
        
        self.assertIn("email", context.exception.detail)
        # Database should not write anything and no email must be enqueued
        mock_user_save.assert_not_called()
        mock_verification_save.assert_not_called()
        mock_on_commit.assert_not_called()

    @patch('django.db.transaction.on_commit')
    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.objects.using')
    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.save')
    @patch('apps.accounts.models.usuario.Usuario.save')
    @patch('apps.accounts.models.usuario.Usuario.objects.using')
    def test_register_duplicate_pending_user_policy(self, mock_user_using, mock_user_save, mock_verification_save, mock_verification_using, mock_on_commit):
        """
        Policy: If user is PENDIENTE, update user details/password, invalidate prior tokens, and queue a new token email.
        """
        mock_pending_user = Usuario(usr_correo="pending@example.com", estado=EstadoUsuario.PENDIENTE)
        mock_user_using.return_value.filter.return_value.first.return_value = mock_pending_user
        
        # Mock prior tokens update count
        mock_verification_using.return_value.filter.return_value.update.return_value = 1
        
        user = register_user(
            email="pending@example.com",
            password="newsecurepassword123",
            nombres="JaneUpdated"
        )
        
        self.assertEqual(user.nombres, "JaneUpdated")
        # Existing user model should save new data, a new verification is saved, prior is updated, and task enqueued
        mock_user_save.assert_called_once()
        mock_verification_save.assert_called_once()
        mock_verification_using.return_value.filter.return_value.update.assert_called_once_with(
            estado=EstadoVerificacion.INVALIDADA,
            motivo_invalidacion="Re-registro o solicitud de nuevo enlace"
        )
        mock_on_commit.assert_called_once()


@patch('django.db.transaction.atomic', DummyAtomic)
class VerificationFlowTest(SimpleTestCase):
    def setUp(self):
        super().setUp()
        self.audit_patcher = patch('apps.audit.services.audit_service.AuditService.record_event')
        self.mock_record_event = self.audit_patcher.start()

    def tearDown(self):
        self.audit_patcher.stop()
        super().tearDown()

    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.objects.using')
    @patch('apps.accounts.models.usuario.Usuario.save')
    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.save')
    def test_verify_email_success(self, mock_verification_save, mock_user_save, mock_verification_using):
        """
        Verify success flow: marks token VERIFICADA, user ACTIVO, and invalidates other pending tokens.
        """
        mock_user = Usuario(
            usr_correo="verify@example.com",
            estado=EstadoUsuario.PENDIENTE,
            correo_verificado=False
        )
        mock_verification = VerificacionCorreo(
            id=uuid.uuid4(),
            usuario=mock_user,
            fecha_expiracion=timezone.now() + timedelta(hours=24),
            estado=EstadoVerificacion.PENDIENTE,
            intentos=0
        )
        
        mock_verification_using.return_value.select_related.return_value.get.return_value = mock_verification
        mock_verification_using.return_value.filter.return_value.exclude.return_value.update.return_value = 0
        
        result_ver = verify_email(plain_token="testtoken123", ip_address="127.0.0.1")
        
        self.assertEqual(result_ver.estado, EstadoVerificacion.VERIFICADA)
        self.assertEqual(mock_user.estado, EstadoUsuario.ACTIVO)
        self.assertTrue(mock_user.correo_verificado)
        
        mock_verification_save.assert_called_once()
        mock_user_save.assert_called_once()
        mock_verification_using.return_value.filter.return_value.exclude.return_value.update.assert_called_once_with(
            estado=EstadoVerificacion.INVALIDADA,
            motivo_invalidacion="Verificación exitosa completada en otro token"
        )

    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.objects.using')
    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.save')
    def test_verify_email_user_blocked_or_deleted(self, mock_verification_save, mock_verification_using):
        """
        Verify that verification fails for deleted or blocked users.
        """
        mock_user_blocked = Usuario(usr_correo="blocked@example.com", estado=EstadoUsuario.BLOQUEADO)
        mock_verification1 = VerificacionCorreo(
            id=uuid.uuid4(),
            usuario=mock_user_blocked,
            fecha_expiracion=timezone.now() + timedelta(hours=24),
            estado=EstadoVerificacion.PENDIENTE,
            intentos=0
        )
        mock_verification_using.return_value.select_related.return_value.get.return_value = mock_verification1
        
        with self.assertRaises(ValidationError) as ctx:
            verify_email(plain_token="testtoken123")
        self.assertIn("se encuentra bloqueado, suspendido o inactivo", str(ctx.exception))
        
        # Test deleted user
        mock_user_deleted = Usuario(usr_correo="deleted@example.com", estado=EstadoUsuario.PENDIENTE, eliminado=True)
        mock_verification2 = VerificacionCorreo(
            id=uuid.uuid4(),
            usuario=mock_user_deleted,
            fecha_expiracion=timezone.now() + timedelta(hours=24),
            estado=EstadoVerificacion.PENDIENTE,
            intentos=0
        )
        mock_verification_using.return_value.select_related.return_value.get.return_value = mock_verification2
        
        with self.assertRaises(ValidationError) as ctx:
            verify_email(plain_token="testtoken123")
        self.assertIn("se encuentra bloqueado, suspendido o inactivo", str(ctx.exception))

    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.objects.using')
    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.save')
    def test_verify_email_expired_marked(self, mock_verification_save, mock_verification_using):
        """
        Verify that expired tokens fail and are saved as VENCIDA.
        """
        mock_user = Usuario(usr_correo="expired@example.com", estado=EstadoUsuario.PENDIENTE)
        mock_verification = VerificacionCorreo(
            id=uuid.uuid4(),
            usuario=mock_user,
            fecha_expiracion=timezone.now() - timedelta(hours=1),
            estado=EstadoVerificacion.PENDIENTE,
            intentos=0
        )
        mock_verification_using.return_value.select_related.return_value.get.return_value = mock_verification
        
        with self.assertRaises(ValidationError) as ctx:
            verify_email(plain_token="testtoken123")
        self.assertEqual(mock_verification.estado, EstadoVerificacion.VENCIDA)
        mock_verification_save.assert_called_once()

    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.objects.using')
    @patch('apps.accounts.models.verificacion_correo.VerificacionCorreo.save')
    def test_verify_email_brute_force_prevention(self, mock_verification_save, mock_verification_using):
        """
        Verify that more than 5 attempts locks and invalidates token.
        """
        mock_user = Usuario(usr_correo="brute@example.com", estado=EstadoUsuario.PENDIENTE)
        mock_verification = VerificacionCorreo(
            id=uuid.uuid4(),
            usuario=mock_user,
            fecha_expiracion=timezone.now() + timedelta(hours=24),
            estado=EstadoVerificacion.PENDIENTE,
            intentos=5
        )
        mock_verification_using.return_value.select_related.return_value.get.return_value = mock_verification
        
        with self.assertRaises(ValidationError) as ctx:
            verify_email(plain_token="testtoken123")
        self.assertEqual(mock_verification.estado, EstadoVerificacion.INVALIDADA)
        self.assertEqual(mock_verification.motivo_invalidacion, "Exceso de intentos de verificación")
        mock_verification_save.assert_called_once()


class SafeUtilitiesAndConfigTest(SimpleTestCase):
    
    def test_email_masking_utility(self):
        """
        Verify email masking helper obfuscates local-parts of emails correctly.
        """
        self.assertEqual(mask_email("testregister@example.com"), "te***@example.com")
        self.assertEqual(mask_email("a@example.com"), "a***@example.com")
        self.assertEqual(mask_email("ab@example.com"), "ab***@example.com")
        self.assertEqual(mask_email("abc@example.com"), "ab***@example.com")
        self.assertEqual(mask_email(""), "")
        self.assertEqual(mask_email(None), None)

    @patch('apps.configuration.models.parametro_sistema.ParametroSistema.objects.using')
    def test_system_parameter_hours_config_reading(self, mock_using):
        """
        Verify selector reads param from DB correctly, or uses fallback if missing.
        """
        mock_param = MagicMock()
        mock_param.tipo = "NUMERO"
        mock_param.valor_numero = 12.0000
        mock_using.return_value.get.return_value = mock_param
        
        val = get_system_parameter_value("VIGENCIA_VERIFICACION_CORREO_HORAS", 24)
        self.assertEqual(val, 12.0)
        
        # Test fallback
        mock_using.return_value.get.side_effect = Exception("Not found")
        val_fallback = get_system_parameter_value("VIGENCIA_VERIFICACION_CORREO_HORAS", 24)
        self.assertEqual(val_fallback, 24)


from rest_framework.test import APIRequestFactory, force_authenticate
from apps.accounts.views.activities import UserActivitiesListView

@patch('django.db.transaction.atomic', DummyAtomic)
@patch('apps.reading.models.sesion_lectura.SesionLectura.objects.using')
@patch('apps.accounts.models.sesion.Sesion.objects.using')
@patch('apps.purchases.models.compra.Compra.objects.using')
class UserActivitiesListViewTest(SimpleTestCase):
    def setUp(self):
        super().setUp()
        self.databases = {'default', 'periodico_db'}
        self.mock_user = Usuario(
            id=1,
            usr_correo="user@example.com",
            nombres="John",
            apellidos="Doe",
            estado="ACTIVO",
            correo_verificado=True
        )

    def test_get_activities_empty(self, mock_compra, mock_sesion, mock_lectura):
        """
        Verify that if no activities exist, the endpoint returns an empty list.
        """
        mock_lectura.return_value.filter.return_value.select_related.return_value.order_by.return_value = []
        mock_sesion.return_value.filter.return_value.order_by.return_value = []
        mock_compra.return_value.filter.return_value.select_related.return_value.order_by.return_value = []

        factory = APIRequestFactory()
        request = factory.get('/api/v1/auth/activities/')
        force_authenticate(request, user=self.mock_user)

        view = UserActivitiesListView.as_view()
        response = view(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

