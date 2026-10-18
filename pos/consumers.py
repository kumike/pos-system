import json
from channels.generic.websocket import AsyncWebsocketConsumer

class StockConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Все кассиры подключаются к одной общей "комнате" (группе)
        self.room_group_name = 'pos_stock_updates'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        pass  # Кассиры только слушают, они ничего не отправляют на сервер через WS

    # Обработчик события обновления остатка
    async def stock_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'stock_update',
            'barcode': event['barcode'],
            'new_stock': event['new_stock']
        }))

    # === ДОБАВЛЕНО: Обработчик события создания нового товара ===
    async def new_product(self, event):
        await self.send(text_data=json.dumps({
            'type': 'new_product',
            'product': event['product']
        }))
