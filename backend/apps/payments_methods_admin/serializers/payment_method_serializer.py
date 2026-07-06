from rest_framework import serializers
from apps.payments_methods_admin.models.payment_method import PaymentMethod

class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ['id', 'nombre', 'numero', 'qr', 'estado', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
