from apps.accounts.views.register import RegisterView
from apps.accounts.views.verify import VerifyEmailView
from apps.accounts.views.resend_verification import ResendVerificationView
from apps.accounts.views.login import LoginView
from apps.accounts.views.refresh import TokenRefreshView
from apps.accounts.views.logout import LogoutView
from apps.accounts.views.password_reset_request import PasswordResetRequestView
from apps.accounts.views.password_reset_confirm import PasswordResetConfirmView
from apps.accounts.views.activities import UserActivitiesListView

__all__ = [
    'RegisterView',
    'VerifyEmailView',
    'ResendVerificationView',
    'LoginView',
    'TokenRefreshView',
    'LogoutView',
    'PasswordResetRequestView',
    'PasswordResetConfirmView',
    'UserActivitiesListView',
]


