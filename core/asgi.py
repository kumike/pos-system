import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
import pos.routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# 1. Сначала инициализируем Django
django_asgi_app = get_asgi_application()

# 2. Затем настраиваем роутинг для HTTP и WebSocket
application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            pos.routing.websocket_urlpatterns
        )
    ),
})
