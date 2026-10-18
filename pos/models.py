from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class Product(models.Model):
    # Единицы измерения
    UNIT_CHOICES = [
        ('pcs', 'Штуки'),
        ('kg', 'Кілограми'),
        ('g', 'Грами'),
        ('l', 'Літри'),
        ('ml', 'Мілілітри'),
        ('m', 'Метри'),
    ]
    
    CATEGORY_CHOICES = [
        ('bread', 'Хліб'),
        ('dairy', 'Молочне'),
        ('cheese', 'Сири'),
        ('meat', 'М\'ясо'),
        ('fish', 'Риба'),
        ('fruits', 'Фрукти та овочі'),
        ('sweets', 'Кондитерські вироби'),
        ('drinks', 'Напої'),
        ('grocery', 'Бакалія'),
        ('household', 'Побутові товари'),
        ('other', 'Інше'),
    ]

    barcode = models.CharField(max_length=13, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    price = models.DecimalField(max_digits=10, decimal_places=2)  # Цена за единицу
    stock = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    is_weighted = models.BooleanField(default=False)
    unit = models.CharField(max_length=3, choices=UNIT_CHOICES, default='pcs')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    min_stock = models.DecimalField(max_digits=10, decimal_places=3, default=5, 
                                    help_text="Минимальный остаток для предупреждения")

    def __str__(self):
        unit_display = dict(self.UNIT_CHOICES).get(self.unit, '')
        return f"{self.name} ({self.price}₽/{unit_display})"

    @property
    def price_display(self):
        """Красивое отображение цены"""
        unit_display = dict(self.UNIT_CHOICES).get(self.unit, '')
        if self.is_weighted:
            return f"{self.price}₽/{unit_display}"
        return f"{self.price}₽"

    class Meta:
        verbose_name = 'Товар'
        verbose_name_plural = 'Товари'

    def __str__(self):
        return self.name


class Shift(models.Model):
    cashier = models.ForeignKey(User, on_delete=models.CASCADE, related_name='shifts')
    opened_at = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(null=True, blank=True)
    is_open = models.BooleanField(default=True)


class Sale(models.Model):
    PAYMENT_METHODS = [
        ('cash', 'Готівка'),
        ('card', 'Картка'),
    ]
    
    cashier = models.ForeignKey(User, on_delete=models.CASCADE)
    shift = models.ForeignKey(Shift, on_delete=models.CASCADE)
    created_at = models.DateTimeField(default=timezone.now)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHODS)
    amount_received = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    change = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    receipt_printed = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Продаж (Чек)'
        verbose_name_plural = 'Продажі (Чеки)'

    def __str__(self):
        return f"Чек #{self.id} від {self.created_at.strftime('%d.%m.%Y %H:%M')}"


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    unit = models.CharField(max_length=3, default='pcs')  # Сохраняем единицу на момент продажи

    class Meta:
        verbose_name = 'Позиція чека'
        verbose_name_plural = 'Позиції чека'

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"


class Supplier(models.Model):
    """Поставщики (опционально, но полезно)"""
    name = models.CharField(max_length=200)
    contact = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return self.name

#=== накладные
class ReceivingDocument(models.Model):
    """Накладная приёмки товара"""
    document_number = models.CharField(max_length=50, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    receiving_date = models.DateField()  # Дата фактической приёмки
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True)
    responsible = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Накладна #{self.document_number} від {self.receiving_date}"

    def calculate_total(self):
        """Пересчитать общую сумму"""
        self.total_amount = sum(item.total for item in self.items.all())
        self.save()


class ReceivingItem(models.Model):
    """Позиция накладной"""
    document = models.ForeignKey(ReceivingDocument, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=10, decimal_places=3)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    def save(self, *args, **kwargs):
        self.total = self.quantity * self.price
        super().save(*args, **kwargs)
