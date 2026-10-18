from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProductViewSet, 
    SaleViewSet, 
    SupplierViewSet, 
    ReceivingDocumentViewSet
)

router = DefaultRouter()
router.register(r'products', ProductViewSet)
router.register(r'sales', SaleViewSet)
router.register(r'suppliers', SupplierViewSet)
router.register(r'receiving-documents', ReceivingDocumentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
