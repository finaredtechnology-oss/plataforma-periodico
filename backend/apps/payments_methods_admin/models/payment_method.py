from django.db import models

class PaymentMethod(models.Model):
    id = models.BigAutoField(db_column='pm_id', primary_key=True)
    nombre = models.CharField(db_column='pm_name', max_length=100)
    numero = models.CharField(db_column='pm_number', max_length=100)
    qr = models.CharField(db_column='pm_qr', max_length=500, null=True, blank=True)
    estado = models.CharField(db_column='pm_status', max_length=20, default='ACTIVO')
    created_at = models.DateTimeField(db_column='created_at', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updated_at', auto_now=True)

    class Meta:
        managed = False
        db_table = 'pdg"."pm_methods'
        unique_together = ('nombre', 'numero')

    def __str__(self):
        return f"{self.nombre}: {self.numero} ({self.estado})"
