from django.contrib import admin
from .models import Product, Sale, SaleItem, Shift

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'barcode', 'price', 'stock', 'category')
    search_fields = ('name', 'barcode')
    list_filter = ('category',)

# Чтобы видеть товары внутри чека
class SaleItemInline(admin.TabularInline):
    model = SaleItem
    readonly_fields = ('product', 'quantity', 'price', 'total')
    can_delete = False

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('id', 'cashier', 'total', 'payment_method', 'created_at')
    list_filter = ('payment_method', 'created_at')
    inlines = [SaleItemInline] # Показываем товары прямо в чекеfrom django.contrib import admin

# Register your models here.
