from django.urls import path
from apps.payments_methods_admin.views.payment_method_views import (
    AdminPaymentMethodListView,
    AdminPaymentMethodDetailView,
    PublicPaymentMethodListView
)

urlpatterns = [
    # Public route to get active payment methods
    path('payments-methods/', PublicPaymentMethodListView.as_view(), name='public-payment-methods-list'),
    
    # Admin routes to manage payment methods
    path('admin/payments-methods/', AdminPaymentMethodListView.as_view(), name='admin-payment-methods-list'),
    path('admin/payments-methods/<int:pk>/', AdminPaymentMethodDetailView.as_view(), name='admin-payment-methods-detail'),
]
