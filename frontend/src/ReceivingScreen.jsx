import { useState, useRef, useEffect } from 'react';

export default function ReceivingScreen({ onBack }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [receivedItems, setReceivedItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef(null);

  // Стан для модального вікна створення нового товару
  const [newProductModal, setNewProductModal] = useState(null); // { barcode } або null
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    unit: 'pcs',
    is_weighted: false,
    category: 'other'
  });
  const nameInputRef = useRef(null);

  // Фокус на поле назви при відкритті модального вікна
  useEffect(() => {
    if (newProductModal && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [newProductModal]);

  const handleScan = async () => {
    if (!searchQuery.trim()) return;
    const barcode = searchQuery.trim();

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/products/check_barcode/?barcode=${barcode}`);
      const data = await res.json();

      if (data.type === 'exact' || data.type === 'weighted') {
        addToReceived(data.product, 1);
        setSearchQuery('');
      } else if (data.type === 'not_found') {
        // Товар не знайдено — відкриваємо модальне вікно для створення
        setNewProductModal({ barcode });
        setFormData({ name: '', price: '', unit: 'pcs', is_weighted: false, category: 'other' });
        setSearchQuery('');
      } else {
        alert('Невідповідь сервера');
        setSearchQuery('');
      }
    } catch (err) {
      console.error(err);
      alert('Помилка мережі');
    }
  };

  const addToReceived = (product, qty) => {
    setReceivedItems(prev => {
      const existing = prev.find(item => item.product.barcode === product.barcode);
      if (existing) {
        return prev.map(item => 
          item.product.barcode === product.barcode 
            ? { ...item, quantity: item.quantity + qty } 
            : item
        );
      }
      return [...prev, { product, quantity: qty, price: product.price }];
    });
    inputRef.current?.focus();
  };

  const updateQty = (barcode, delta) => {
    setReceivedItems(prev => prev.map(item => {
      if (item.product.barcode === barcode) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const updatePrice = (barcode, newPrice) => {
    setReceivedItems(prev => prev.map(item => 
      item.product.barcode === barcode 
        ? { ...item, price: parseFloat(newPrice) || 0 } 
        : item
    ));
  };

  const removeItem = (barcode) => {
    setReceivedItems(prev => prev.filter(item => item.product.barcode !== barcode));
  };

  // Логіка створення нового товару
  const handleCreateProduct = async () => {
    if (!formData.name.trim()) return alert('Введіть назву товару');
    if (!formData.price || parseFloat(formData.price) <= 0) return alert('Введіть коректну ціну');

    setIsProcessing(true);
    try {
      const payload = {
        barcode: newProductModal.barcode,
        name: formData.name.trim(),
        price: parseFloat(formData.price),
        stock: 0, // Початковий залишок 0, ми додамо його нижче
        unit: formData.unit,
        is_weighted: formData.is_weighted,
        category: formData.category,
        min_stock: 6
      };

      const res = await fetch('http://127.0.0.1:8000/api/products/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.barcode ? 'Цей штрихкод вже існує!' : 'Помилка створення товару');
      }

      const createdProduct = await res.json();
      
      // Одразу додаємо створений товар до списку прийомки з кількістю 1 (або можна зробити поле кількості в модалці)
      addToReceived(createdProduct, 1);
      
      // Закриваємо модалку
      setNewProductModal(null);
      setFormData({ name: '', price: '', unit: 'pcs', is_weighted: false, category: 'other' });
      
    } catch (err) {
      alert(`Помилка: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (receivedItems.length === 0) return alert('Список порожній!');
    
    setIsProcessing(true);
    try {
      const payload = {
        items: receivedItems.map(item => ({
          barcode: item.product.barcode,
          quantity: item.quantity,
          price: item.price
        }))
      };

      const res = await fetch('http://127.0.0.1:8000/api/products/receive/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      
      if (!res.ok) {
        if (data.errors) {
          alert('Помилки при прийомці:\n' + data.errors.join('\n'));
        } else {
          throw new Error(data.error || 'Помилка сервера');
        }
      }
      
      if (data.updated_count > 0) {
        alert(`✅ Успішно прийнято ${data.updated_count} позицій!\nЗалишки та ціни оновлено.`);
      }
      
      setReceivedItems([]);
    } catch (err) {
      alert(`Помилка: ${err.message}`);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      // Якщо модальне вікно відкрите, Enter не повинен закривати його або сканувати
      if (newProductModal) return; 
      handleScan();
    }
    if (e.key === 'Escape' && newProductModal) {
      setNewProductModal(null);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 p-6" onKeyDown={handleKeyDown}>
      {/* === МОДАЛЬНЕ ВІКНО СТВОРЕННЯ ТОВАРУ === */}
      {newProductModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setNewProductModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Новий товар</h2>
              <p className="text-sm text-gray-500 mt-1">Штрихкод <span className="font-mono bg-gray-100 px-2 py-1 rounded">{newProductModal.barcode}</span> не знайдено в базі.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Назва товару *</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Наприклад: Сир Моцарела"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ціна (₴) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Одиниця</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({...formData, unit: e.target.value})}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    <option value="pcs">Штуки (шт)</option>
                    <option value="kg">Кілограми (кг)</option>
                    <option value="g">Грами (г)</option>
                    <option value="l">Літри (л)</option>
                    <option value="ml">Мілілітри (мл)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <input
                  type="checkbox"
                  id="is_weighted"
                  checked={formData.is_weighted}
                  onChange={(e) => setFormData({...formData, is_weighted: e.target.checked})}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_weighted" className="text-sm font-semibold text-gray-700 cursor-pointer select-none">
                  Це ваговий товар (продається на вагу)
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setNewProductModal(null); inputRef.current?.focus(); }}
                className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition"
              >
                Скасувати
              </button>
              <button
                onClick={handleCreateProduct}
                disabled={isProcessing}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-lg transition"
              >
                {isProcessing ? 'Створення...' : '✓ Створити та додати'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === ОСНОВНИЙ ЕКРАН ПРИЙОМКИ === */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">📦 Прийомка товару</h1>
        <button onClick={onBack} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold transition">
          ← На головну
        </button>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <input
              ref={inputRef}
              type="text"
              placeholder="🔍 Скануйте штрихкод товару..."
              className="w-full p-4 text-xl border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if(e.key === 'Enter') handleScan(); }}
              autoFocus
              disabled={!!newProductModal} // Блокуємо поле, якщо відкрита модалка
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {receivedItems.length === 0 ? (
              <div className="text-center text-gray-400 mt-20 text-xl">
                📭 Список порожній.<br/>Почніть сканувати товари!
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 uppercase text-sm sticky top-0">
                    <th className="p-3">Назва</th>
                    <th className="p-3">ШК</th>
                    <th className="p-3 text-center">Кількість</th>
                    <th className="p-3 text-right">Ціна (₴)</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {receivedItems.map(item => (
                    <tr key={item.product.barcode} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-semibold flex items-center gap-2">
                        {item.product.name}
                        {item.product.is_weighted && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">⚖️</span>}
                      </td>
                      <td className="p-3 text-sm text-gray-500 font-mono">{item.product.barcode}</td>
<td className="p-3">
  <div className="flex items-center justify-center space-x-2">
    <button 
      onClick={() => updateQty(item.product.barcode, -1)} 
      className="w-8 h-8 bg-red-100 text-red-700 rounded-full font-bold hover:bg-red-200"
    >−</button>
    <input
      type="number"
      min="1"
      step="1"
      value={item.quantity}
      onChange={(e) => {
        const val = parseInt(e.target.value) || 0;
        setReceivedItems(prev => prev.map(it => 
          it.product.barcode === item.product.barcode 
            ? { ...it, quantity: val > 0 ? val : 1 } 
            : it
        ));
      }}
      className="w-16 p-1 text-center text-lg font-bold border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
    />
    <button 
      onClick={() => updateQty(item.product.barcode, 1)} 
      className="w-8 h-8 bg-green-100 text-green-700 rounded-full font-bold hover:bg-green-200"
    >+</button>
  </div>
</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <input 
                            type="number" 
                            step="0.01"
                            min="0"
                            value={item.price} 
                            onChange={(e) => updatePrice(item.product.barcode, e.target.value)}
                            className="w-24 p-2 text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                          <span className="text-gray-500">₴</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => removeItem(item.product.barcode)} className="text-red-500 hover:text-red-700 font-bold text-xl px-2">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="w-80 flex flex-col bg-gray-800 text-white rounded-xl shadow-lg p-6">
          <div className="text-gray-400 text-sm uppercase tracking-wider mb-2">Всього позицій</div>
          <div className="text-6xl font-bold text-blue-400 mb-8">{receivedItems.length}</div>
          
          <div className="text-gray-400 text-sm uppercase tracking-wider mb-2">Одиниць прийнято</div>
          <div className="text-4xl font-bold text-green-400 mb-8">
            {receivedItems.reduce((sum, item) => sum + item.quantity, 0)}
          </div>

          <div className="mt-auto space-y-3">
            <button
              onClick={handleConfirm}
              disabled={isProcessing || receivedItems.length === 0}
              className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-bold text-xl py-4 rounded-lg shadow-lg transition"
            >
              {isProcessing ? 'Обробка...' : '✅ ПІДТВЕРДИТИ'}
            </button>
            <button
              onClick={() => setReceivedItems([])}
              className="w-full bg-red-900/50 hover:bg-red-900 text-red-200 font-semibold py-3 rounded-lg transition"
            >
              🗑 Очистити список
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
