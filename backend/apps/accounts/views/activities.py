from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.utils import timezone
from datetime import datetime

from apps.reading.models.sesion_lectura import SesionLectura
from apps.accounts.models.sesion import Sesion
from apps.purchases.models.compra import Compra

def format_activity_time(dt: datetime) -> str:
    if not dt:
        return ""
    # Convert dt to local time
    dt = timezone.localtime(dt)
    now = timezone.localtime(timezone.now())
    
    # Months in Spanish
    months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    
    time_str = dt.strftime("%I:%M %p")
    time_str = time_str.replace("AM", "AM").replace("PM", "PM")
    
    if dt.date() == now.date():
        return f"Hoy, {time_str}"
    elif dt.date() == (now - timezone.timedelta(days=1)).date():
        return f"Ayer, {time_str}"
    else:
        return f"{dt.day} {months[dt.month - 1]}, {time_str}"

class UserActivitiesListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        activities = []

        # 1. Fetch reading sessions
        try:
            reading_sessions = SesionLectura.objects.using('periodico_db').filter(
                usuario=user
            ).select_related('edicion').order_by('-fecha_inicio')[:10]
            
            for s in reading_sessions:
                # Format public date
                sub_text = ""
                if s.edicion.fecha_edicion:
                    sub_text = f"Edición del {s.edicion.fecha_edicion.strftime('%d %b %Y')}"
                
                activities.append({
                    "type": "read",
                    "text": "Leíste una edición",
                    "detail": s.edicion.titulo,
                    "sub": sub_text,
                    "time": format_activity_time(s.fecha_inicio),
                    "icon": "BookCopy",
                    "iconColor": "text-emerald-600 bg-emerald-50",
                    "timestamp": s.fecha_inicio
                })
        except Exception:
            pass

        # 2. Fetch logins / sessions
        try:
            logins = Sesion.objects.using('periodico_db').filter(
                usuario=user
            ).order_by('-fecha_inicio')[:10]
            
            for l in logins:
                activities.append({
                    "type": "session",
                    "text": "Iniciaste sesión",
                    "detail": f"Dispositivo: {l.dispositivo or 'Desconocido'}",
                    "sub": f"IP: {l.direccion_ip or 'Desconocida'}",
                    "time": format_activity_time(l.fecha_inicio),
                    "icon": "User",
                    "iconColor": "text-blue-600 bg-blue-50",
                    "timestamp": l.fecha_inicio
                })
        except Exception:
            pass

        # 3. Fetch purchases
        try:
            purchases = Compra.objects.using('periodico_db').filter(
                usuario=user,
                estado='PAGADA'
            ).select_related('edicion').order_by('-fecha_creacion')[:10]
            
            for c in purchases:
                is_sub = any(term in c.referencia_interna.upper() for term in ["DIARIO", "MENSUAL", "ANUAL"])
                
                if is_sub:
                    text = "Adquiriste una suscripción"
                    detail = "Suscripción activa"
                    if "MENSUAL" in c.referencia_interna.upper():
                        detail = "Plan Mensual"
                    elif "ANUAL" in c.referencia_interna.upper():
                        detail = "Plan Anual"
                    elif "DIARIO" in c.referencia_interna.upper():
                        detail = "Plan Diario"
                else:
                    text = "Compraste una edición"
                    detail = c.edicion.titulo if c.edicion else "Edición digital"
                
                activities.append({
                    "type": "purchase",
                    "text": text,
                    "detail": detail,
                    "sub": f"{c.monto_total} {c.moneda}",
                    "time": format_activity_time(c.fecha_confirmacion or c.fecha_creacion),
                    "icon": "CreditCard",
                    "iconColor": "text-amber-600 bg-amber-50",
                    "timestamp": c.fecha_confirmacion or c.fecha_creacion
                })
        except Exception:
            pass

        # Sort combined activities by timestamp desc and take top 10
        activities.sort(key=lambda x: x["timestamp"], reverse=True)
        activities = activities[:10]

        # Remove timestamp before returning
        for act in activities:
            act.pop("timestamp", None)

        return Response(activities, status=status.HTTP_200_OK)
