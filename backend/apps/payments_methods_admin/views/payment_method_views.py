import logging
import uuid
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.core.exceptions import ValidationError

from apps.payments_methods_admin.serializers.payment_method_serializer import PaymentMethodSerializer
from apps.payments_methods_admin.selectors.payment_method_selector import get_all_payment_methods
from apps.payments_methods_admin.services.payment_method_service import (
    create_payment_method,
    update_payment_method,
    delete_payment_method
)
from apps.purchases.views.admin_purchases_views import IsPlatformAdmin
from apps.files.services.storage_service import StorageService

logger = logging.getLogger(__name__)

class AdminPaymentMethodListView(APIView):
    permission_classes = [IsPlatformAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        try:
            pms = get_all_payment_methods(only_active=False)
            serializer = PaymentMethodSerializer(pms, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in AdminPaymentMethodListView GET: {e}", exc_info=True)
            return Response({'detail': 'Error al listar los métodos de pago.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request):
        nombre = request.data.get('pm_name')
        numero = request.data.get('pm_number')
        estado = request.data.get('pm_status', 'ACTIVO')
        qr_file = request.FILES.get('pm_qr')

        qr_path = None
        if qr_file:
            # Validate format (extension)
            ext = qr_file.name.split('.')[-1].lower()
            if ext not in ['jpg', 'jpeg', 'png']:
                return Response(
                    {'detail': 'Formato de imagen inválido. Solo se admiten archivos JPG, JPEG o PNG.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            # Validate size (max 5MB)
            if qr_file.size > 5 * 1024 * 1024:
                return Response(
                    {'detail': 'El tamaño de la imagen QR no debe exceder los 5MB.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                # Rename the file using uuid to prevent names containing forbidden private keywords
                new_filename = f"qr_{uuid.uuid4().hex}.{ext}"
                # Save file publicly for platform (tenant_id=0)
                relative_path = StorageService.save_public_file(qr_file, tenant_id=0, original_filename=new_filename)
                qr_path = f"/media/{relative_path}"
            except Exception as e:
                logger.error(f"Error saving QR image: {e}", exc_info=True)
                return Response(
                    {'detail': 'Error al subir la imagen QR.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        if not nombre or not numero:
            return Response(
                {'detail': 'El nombre del método de pago y el número/referencia son obligatorios.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            ip_address = request.META.get('REMOTE_ADDR')
            user_agent = request.META.get('HTTP_USER_AGENT')

            pm = create_payment_method(
                nombre=nombre,
                numero=numero,
                qr=qr_path,
                estado=estado,
                usuario=request.user,
                ip_address=ip_address,
                user_agent=user_agent
            )
            serializer = PaymentMethodSerializer(pm)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ValidationError as ve:
            return Response({'detail': ve.message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error in AdminPaymentMethodListView POST: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AdminPaymentMethodDetailView(APIView):
    permission_classes = [IsPlatformAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def put(self, request, pk):
        nombre = request.data.get('pm_name')
        numero = request.data.get('pm_number')
        estado = request.data.get('pm_status')
        qr_file = request.FILES.get('pm_qr')
        clear_qr = request.data.get('clear_qr', 'false').lower() == 'true'

        qr_path = None
        if qr_file:
            ext = qr_file.name.split('.')[-1].lower()
            if ext not in ['jpg', 'jpeg', 'png']:
                return Response(
                    {'detail': 'Formato de imagen inválido. Solo se admiten archivos JPG, JPEG o PNG.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if qr_file.size > 5 * 1024 * 1024:
                return Response(
                    {'detail': 'El tamaño de la imagen QR no debe exceder los 5MB.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                new_filename = f"qr_{uuid.uuid4().hex}.{ext}"
                relative_path = StorageService.save_public_file(qr_file, tenant_id=0, original_filename=new_filename)
                qr_path = f"/media/{relative_path}"
            except Exception as e:
                logger.error(f"Error updating QR image: {e}", exc_info=True)
                return Response(
                    {'detail': 'Error al subir la nueva imagen QR.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        elif clear_qr:
            # If front-end explicitly wants to clear the QR code
            qr_path = ""

        if not nombre or not numero or not estado:
            return Response(
                {'detail': 'El nombre, número/referencia y estado son obligatorios.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            ip_address = request.META.get('REMOTE_ADDR')
            user_agent = request.META.get('HTTP_USER_AGENT')

            pm = update_payment_method(
                pm_id=pk,
                nombre=nombre,
                numero=numero,
                qr=qr_path,
                estado=estado,
                usuario=request.user,
                ip_address=ip_address,
                user_agent=user_agent
            )
            serializer = PaymentMethodSerializer(pm)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except ValidationError as ve:
            return Response({'detail': ve.message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error in AdminPaymentMethodDetailView PUT: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, pk):
        try:
            ip_address = request.META.get('REMOTE_ADDR')
            user_agent = request.META.get('HTTP_USER_AGENT')

            delete_payment_method(
                pm_id=pk,
                usuario=request.user,
                ip_address=ip_address,
                user_agent=user_agent
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
        except ValidationError as ve:
            return Response({'detail': ve.message}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Error in AdminPaymentMethodDetailView DELETE: {e}", exc_info=True)
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PublicPaymentMethodListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            pms = get_all_payment_methods(only_active=True)
            serializer = PaymentMethodSerializer(pms, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error in PublicPaymentMethodListView GET: {e}", exc_info=True)
            return Response({'detail': 'Error al listar los métodos de pago activos.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
