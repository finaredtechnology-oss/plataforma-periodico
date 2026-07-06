from apps.payments_methods_admin.models.payment_method import PaymentMethod

def get_all_payment_methods(only_active: bool = False):
    """
    Queries payment methods from the periodico_db database.
    """
    queryset = PaymentMethod.objects.using('periodico_db').all()
    if only_active:
        queryset = queryset.filter(estado='ACTIVO')
    return queryset.order_by('created_at')
