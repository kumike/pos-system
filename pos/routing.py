from django.urls import path
from . import consumers

websocket_urlpatterns = [
    # Используем обычный path для точного совпадения
    path('ws/stock/', consumers.StockConsumer.as_asgi()),
]
