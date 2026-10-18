from .models import Product, Sale, SaleItem, Supplier, ReceivingDocument, ReceivingItem
from rest_framework import serializers

class ProductSerializer(serializers.ModelSerializer):
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    price_display = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = ['id', 'barcode', 'name', 'price', 'stock', 'is_weighted', 
                  'unit', 'unit_display', 'category', 'category_display', 
                  'min_stock', 'price_display']


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    barcode = serializers.CharField(source='product.barcode', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_name', 'barcode', 'quantity', 
                  'price', 'total', 'unit', 'unit_display']


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    cart_items = serializers.ListField(write_only=True, required=False)

    class Meta:
        model = Sale
        fields = ['id', 'cashier', 'shift', 'created_at', 'total', 
                  'payment_method', 'amount_received', 'change', 
                  'receipt_printed', 'items', 'cart_items']


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'


class ReceivingItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    barcode = serializers.CharField(source='product.barcode', read_only=True)
    
    class Meta:
        model = ReceivingItem
        fields = ['id', 'product', 'product_name', 'barcode', 'quantity', 'price', 'total']


class ReceivingDocumentSerializer(serializers.ModelSerializer):
    items = ReceivingItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    
    class Meta:
        model = ReceivingDocument
        fields = ['id', 'document_number', 'created_at', 'receiving_date', 
                  'supplier', 'supplier_name', 'responsible', 'total_amount', 
                  'notes', 'items']
