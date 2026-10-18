from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Q
from .models import Product, Sale, SaleItem, Supplier, ReceivingDocument, ReceivingItem
from .serializers import ProductSerializer, SaleSerializer, SupplierSerializer, ReceivingDocumentSerializer

def parse_weight_barcode(barcode):
    """
    Пытается распознать штрихкод весового товара.
    Возвращает (base_barcode, weight) или None.
    
    Формат: 2XXXXXYYYYYC (13 цифр)
    - 2 — префикс весового товара
    - XXXXX — код товара (5 цифр)
    - YYYYY — вес в граммах или цена (5 цифр)
    - C — контрольная цифра
    """
    if len(barcode) != 13 or not barcode.startswith('2'):
        return None
    
    base_barcode = f"2{barcode[1:6]}00000{barcode[-1]}"  # Нормализуем
    weight_grams = int(barcode[6:11])
    
    # Если вес больше 10000 — скорее всего это цена, а не вес
    # В таком случае возвращаем None, пусть кассир вводит вручную
    if weight_grams > 10000:
        return None
    
    weight_kg = weight_grams / 1000.0
    return {'base_barcode': base_barcode, 'weight': weight_kg}


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

    def get_queryset(self):
        queryset = Product.objects.all()
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(barcode__endswith=search)
            )
        return queryset

    @action(detail=False, methods=['get'])
    def check_barcode(self, request):
        """Проверка штрихкода — возвращает инфо о товаре и является ли он весовым"""
        barcode = request.query_params.get('barcode', '')
        if not barcode:
            return Response({'error': 'barcode required'}, status=400)
        
        # Сначала ищем точное совпадение
        try:
            product = Product.objects.get(barcode=barcode)
            return Response({
                'type': 'exact',
                'product': ProductSerializer(product).data
            })
        except Product.DoesNotExist:
            pass
        
        # Пытаемся распознать как весовой
        parsed = parse_weight_barcode(barcode)
        if parsed:
            try:
                product = Product.objects.get(barcode=parsed['base_barcode'])
                if product.is_weighted:
                    return Response({
                        'type': 'weighted',
                        'product': ProductSerializer(product).data,
                        'weight': parsed['weight']
                    })
            except Product.DoesNotExist:
                pass
        
        return Response({'type': 'not_found'})
       
    @action(detail=False, methods=['post'])
    def receive(self, request):
        """Прийомка товару на склад з можливістю оновлення ціни"""
        from decimal import Decimal, InvalidOperation
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        items = request.data.get('items', [])
        
        if not items:
            return Response({"error": "Список товарів порожній"}, status=400)

        updated_products = []
        errors = []

        for item in items:
            barcode = item.get('barcode')
            
            # Безпечне перетворення кількості
            try:
                qty = float(item.get('quantity', 0))
            except (ValueError, TypeError):
                errors.append(f"Некоректна кількість для штрихкоду {barcode}")
                continue
            
            if qty <= 0:
                continue

            try:
                product = Product.objects.get(barcode=barcode)
                
                # 1. Оновлюємо залишок (безпечно через Decimal)
                product.stock += Decimal(str(qty))
                
                # 2. Оновлюємо ціну, якщо вона передана і валідна
                new_price = item.get('price')
                if new_price is not None:
                    try:
                        product.price = Decimal(str(new_price))
                    except (InvalidOperation, ValueError):
                        errors.append(f"Некоректна ціна для товару {product.name}")
                
                product.save()
                
                updated_products.append({
                    'barcode': product.barcode,
                    'new_stock': float(product.stock),
                    'name': product.name,
                    'new_price': float(product.price)
                })
            except Product.DoesNotExist:
                errors.append(f"Товар зі штрихкодом {barcode} не знайдено в базі")

        # WebSocket сповіщення про зміну залишків (тільки для успішно оновлених)
        if updated_products:
            channel_layer = get_channel_layer()
            for p in updated_products:
                async_to_sync(channel_layer.group_send)(
                    'pos_stock_updates',
                    {
                        'type': 'stock_update',
                        'barcode': p['barcode'],
                        'new_stock': p['new_stock']
                    }
                )

        # Якщо були помилки, повертаємо їх разом із частково успішним результатом
        if errors:
            return Response({
                "success": len(updated_products) > 0,
                "updated_count": len(updated_products),
                "details": updated_products,
                "errors": errors
            }, status=400 if not updated_products else 207) # 207 Multi-Status

        return Response({
            "success": True, 
            "updated_count": len(updated_products),
            "details": updated_products
        })   

##=============================
    def create(self, request, *args, **kwargs):
        """Создание товара + уведомление касс через WebSocket"""
        response = super().create(request, *args, **kwargs)

        if response.status_code == 201:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            from .serializers import ProductSerializer

            product = response.data
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                'pos_stock_updates',
                {
                    'type': 'new_product',
                    'product': product
                }
            )
        return response

        #####=============================


class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer

    @transaction.atomic
    def create(self, request):
        data = request.data
        cart_items = data.get('cart_items', [])
        
        if not cart_items:
            return Response({"error": "Кошик порожній"}, status=status.HTTP_400_BAD_REQUEST)

        total = 0
        sale_items_data = []

        from django.contrib.auth.models import User
        cashier_user = request.user if request.user.is_authenticated else User.objects.first()
        
        if not cashier_user:
            return Response({"error": "Користувача не знайдено"}, status=400)

        for item in cart_items:
            barcode = item['barcode']
            quantity = Decimal(str(item['quantity'])) 
            
            # Для весовых товаров минимальное количество 0.001 (1 грамм)
            if quantity <= 0:
                return Response({"error": f"Некоректна кількість для {barcode}"}, status=400)
            
            try:
                product = Product.objects.select_for_update().get(barcode=barcode)
            except Product.DoesNotExist:
                return Response({"error": f"Товар {barcode} не знайдено"}, status=404)
            
            # Проверяем, что весовой товар не продается как штуки
            if product.is_weighted and item.get('force_pcs', False):
                return Response({"error": f"{product.name} — ваговий товар"}, status=400)
            
            if product.stock < quantity:
                return Response({
                    "error": f"Недостатньо товару: {product.name}. Залишок: {product.stock} {product.get_unit_display()}"
                }, status=400)
            
            item_total = product.price * quantity
            total += item_total
            
            sale_items_data.append({
                'product': product,
                'quantity': quantity,
                'price': product.price,
                'total': item_total,
                'unit': product.unit
            })
            
            product.stock -= quantity
            product.save()
            
            # WebSocket уведомление
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                'pos_stock_updates',
                {
                    'type': 'stock_update',
                    'barcode': product.barcode,
                    'new_stock': float(product.stock)
                }
            )

        sale = Sale.objects.create(
            cashier=cashier_user,
            shift_id=data.get('shift_id'),
            total=total,
            payment_method=data.get('payment_method'),
            amount_received=data.get('amount_received'),
            change=data.get('change'),
            receipt_printed=data.get('receipt_printed', False)
        )

        for item_data in sale_items_data:
            SaleItem.objects.create(sale=sale, **item_data)

        serializer = SaleSerializer(sale)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
     # === ВОТ ЭТОТ МЕТОД СТАТС ДОЛЖЕН БЫТЬ ВНУТРИ КЛАССА SaleViewSet ===
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Получение статистики с фильтрацией по периоду"""
        from django.db.models import Sum, Count
        from django.utils import timezone
        from datetime import timedelta, datetime
        from django.db.models.functions import TruncDate, TruncHour
        
        # Получаем параметры периода
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        
        today = timezone.now().date()
        
        # Определяем период по умолчанию — сегодня
        if start_date_str and end_date_str:
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Невірний формат дати. Використовуйте YYYY-MM-DD"}, status=400)
        else:
            start_date = today
            end_date = today
        
        # Вычисляем "предыдущий период" той же длительности для сравнения
        period_length = (end_date - start_date).days + 1
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=period_length - 1)
        
        # --- ТЕКУЩИЙ ПЕРИОД ---
        current_sales = Sale.objects.filter(created_at__date__range=[start_date, end_date])
        current_revenue = current_sales.aggregate(total=Sum('total'))['total'] or 0
        current_receipts = current_sales.count()
        current_avg_check = (current_revenue / current_receipts) if current_receipts > 0 else 0
        
        # Разбивка по оплате
        current_by_payment = current_sales.values('payment_method').annotate(
            total=Sum('total'),
            count=Count('id')
        )
        
        # --- ПРЕДЫДУЩИЙ ПЕРИОД (для сравнения) ---
        prev_sales = Sale.objects.filter(created_at__date__range=[prev_start, prev_end])
        prev_revenue = prev_sales.aggregate(total=Sum('total'))['total'] or 0
        prev_receipts = prev_sales.count()
        
        # Процент изменения выручки
        if prev_revenue > 0:
            revenue_change_percent = ((current_revenue - prev_revenue) / prev_revenue) * 100
        else:
            revenue_change_percent = 100.0 if current_revenue > 0 else 0.0
        
        # --- ГРУППИРОВКА ПО ДНЯМ ---
        daily_stats = current_sales.annotate(
            day=TruncDate('created_at')
        ).values('day').annotate(
            revenue=Sum('total'),
            receipts=Count('id')
        ).order_by('day')
        
        # --- ПОЧАСОВАЯ АКТИВНОСТЬ ---
        hourly_stats = current_sales.annotate(
            hour=TruncHour('created_at')
        ).values('hour').annotate(
            revenue=Sum('total'),
            receipts=Count('id')
        ).order_by('hour')
        
        # --- ТОП ТОВАРОВ ЗА ПЕРИОД ---
        top_products = SaleItem.objects.filter(
            sale__created_at__date__range=[start_date, end_date]
        ).values('product__name', 'product__barcode').annotate(
            total_qty=Sum('quantity'),
            total_revenue=Sum('total')
        ).order_by('-total_revenue')[:10]
        
        return Response({
            'period': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat(),
                'prev_start': prev_start.isoformat(),
                'prev_end': prev_end.isoformat(),
            },
            'current': {
                'revenue': float(current_revenue),
                'receipts': current_receipts,
                'avg_check': float(current_avg_check),
                'by_payment': {
                    'cash': next((x for x in current_by_payment if x['payment_method'] == 'cash'), {'total': 0, 'count': 0}),
                    'card': next((x for x in current_by_payment if x['payment_method'] == 'card'), {'total': 0, 'count': 0}),
                }
            },
            'comparison': {
                'prev_revenue': float(prev_revenue),
                'prev_receipts': prev_receipts,
                'revenue_change_percent': round(revenue_change_percent, 1),
            },
            'daily': [
                {
                    'day': item['day'].isoformat(),
                    'revenue': float(item['revenue'] or 0),
                    'receipts': item['receipts']
                } for item in daily_stats
            ],
            'hourly': [
                {
                    'hour': item['hour'].hour,
                    'revenue': float(item['revenue'] or 0),
                    'receipts': item['receipts']
                } for item in hourly_stats
            ],
            'top_products': list(top_products),
        })
#=======================================
from .models import Supplier, ReceivingDocument, ReceivingItem
from .serializers import SupplierSerializer, ReceivingDocumentSerializer, ReceivingItemSerializer
from django.utils import timezone


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer


class ReceivingDocumentViewSet(viewsets.ModelViewSet):
    queryset = ReceivingDocument.objects.all()
    serializer_class = ReceivingDocumentSerializer

    @action(detail=False, methods=['get'])
    def list_with_filters(self, request):
        """Получение списка накладных с фильтрацией по датам и поиском"""
        from django.utils import timezone
        from datetime import datetime, timedelta
        from django.db.models import Q

        # Получаем параметры фильтрации
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        search = request.query_params.get('search', '')

        # Определяем период
        if start_date_str and end_date_str:
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({"error": "Невірний формат дати"}, status=400)
        else:
            # По умолчанию — последние 30 дней
            end_date = timezone.now().date()
            start_date = end_date - timedelta(days=30)

        # Базовый queryset
        queryset = ReceivingDocument.objects.filter(
            receiving_date__range=[start_date, end_date]
        ).select_related('supplier')

        # Поиск по номеру или поставщику
        if search:
            queryset = queryset.filter(
                Q(document_number__icontains=search) |
                Q(supplier__name__icontains=search) |
                Q(notes__icontains=search)
            )

        # Сортировка (новые сначала)
        queryset = queryset.order_by('-receiving_date', '-created_at')

        # Сериализуем
        serializer = ReceivingDocumentSerializer(queryset, many=True)

        # Добавляем итоговую сумму за период
        total_sum = sum(doc.total_amount for doc in queryset)

        return Response({
            'documents': serializer.data,
            'total_sum': float(total_sum),
            'count': queryset.count()
        })
        ############



    def create(self, request):
        """Создание накладной с позициями"""
        from decimal import Decimal

        data = request.data
        items_data = data.get('items', [])

        if not items_data:
            return Response({"error": "Список товарів порожній"}, status=400)

        # Генерируем номер накладной (если не указан)
        doc_number = data.get('document_number')
        if not doc_number:
            today = timezone.now().strftime('%Y%m%d')
            count = ReceivingDocument.objects.filter(
                receiving_date=timezone.now().date()
            ).count() + 1
            doc_number = f"ПТ-{today}-{count:03d}"

        # Создаём накладную
        document = ReceivingDocument.objects.create(
            document_number=doc_number,
            receiving_date=data.get('receiving_date', timezone.now().date()),
            supplier_id=data.get('supplier'),
            responsible=request.user if request.user.is_authenticated else None,
            notes=data.get('notes', '')
        )

        # Добавляем позиции и обновляем остатки
        for item in items_data:
            barcode = item.get('barcode')
            qty = Decimal(str(item.get('quantity', 0)))
            price = Decimal(str(item.get('price', 0)))

            try:
                product = Product.objects.get(barcode=barcode)

                # Обновляем остаток и цену
                product.stock += qty
                product.price = price
                product.save()

                # Создаём позицию накладной
                ReceivingItem.objects.create(
                    document=document,
                    product=product,
                    quantity=qty,
                    price=price
                )

                # WebSocket уведомление
                from channels.layers import get_channel_layer
                from asgiref.sync import async_to_sync
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    'pos_stock_updates',
                    {
                        'type': 'stock_update',
                        'barcode': product.barcode,
                        'new_stock': float(product.stock)
                    }
                )
            except Product.DoesNotExist:
                pass

        # Пересчитываем общую сумму
        document.calculate_total()

        serializer = ReceivingDocumentSerializer(document)
        return Response(serializer.data, status=201)
