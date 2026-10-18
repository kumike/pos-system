import { useState, useRef, useEffect } from 'react';

export default function ReceivingDocumentScreen({ onBack }) {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [receivingDate, setReceivingDate] = useState(new Date().toISOString().split('T')[0]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef(null);

  // Состояние для модального окна создания нового товара
  const [newProductModal, setNewProductModal] = useState(null);
  
  // НОВОЕ: Расширенный formData — теперь содержит все поля как в админке Django
  const [formData, setFormData] = useState({ 
    barcode: '',        // НОВОЕ: штрихкод (можно редактировать)
    name: '',           // Название товара
    price: '',          // Цена
    stock: 0,           // НОВОЕ: начальный остаток на складе
    unit: 'pcs',        // Единица измерения (pcs/kg/g/l)
    is_weighted: false, // Весовой ли товар
    category: 'other',  // НОВОЕ: категория товара
    min_stock: 6,       // НОВОЕ: минимальный остаток для предупреждения
    quantity: 1         // Количество для приёмки
  });
  const nameInputRef = useRef(null);

  // НОВОЕ: Список категорий (дублирует модель Product.CATEGORY_CHOICES)
  const CATEGORIES = [
    { value: 'bread', label: 'Хліб' },
    { value: 'dairy', label: 'Молочне' },
    { value: 'cheese', label: 'Сири' },
    { value: 'meat', label: 'М\'ясо' },
    { value: 'fish', label: 'Риба' },
    { value: 'fruits', label: 'Фрукти та овочі' },
    { value: 'sweets', label: 'Кондитерські вироби' },
    { value: 'drinks', label: 'Напої' },
    { value: 'grocery', label: 'Бакалія' },
    { value: 'household', label: 'Побутові товари' },
    { value: 'other', label: 'Інше' }
  ];

  // НОВОЕ: Список единиц измерения (дублирует модель Product.UNIT_CHOICES)
  const UNITS = [
    { value: 'pcs', label: 'Штуки (шт)' },
    { value: 'kg', label: 'Кілограми (кг)' },
    { value: 'g', label: 'Грами (г)' },
    { value: 'l', label: 'Літри (л)' },
    { value: 'ml', label: 'Мілілітри (мл)' },
    { value: 'm', label: 'Метри (м)' }
  ];

  // Загрузка списка поставщиков при монтировании
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/suppliers/')
      .then(res => res.json())
      .then(data => setSuppliers(data))
      .catch(() => setSuppliers([]));
  }, []);

  // Автофокус на поле названия при открытии модалки
  useEffect(() => {
    if (newProductModal && nameInputRef.current) nameInputRef.current.focus();
  }, [newProductModal]);

  // Вспомогательные функции для определения шага/минимума количества
  const getQtyStep = (isWeighted) => isWeighted ? 0.1 : 1;
  const getQtyMin = (isWeighted) => isWeighted ? 0.001 : 1;

  // Форматирование количества для отображения
  const formatQty = (qty, isWeighted) => {
    if (isWeighted) return Number(qty).toFixed(3);
    return Math.round(qty).toString();
  };

  // Обработка сканирования штрихкода
  const handleScan = async () => {
    if (!searchQuery.trim()) return;
    const barcode = searchQuery.trim();

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/products/check_barcode/?barcode=${barcode}`);
      const data = await res.json();

      if (data.type === 'exact' || data.type === 'weighted') {
        addItem(data.product, 1);
        setSearchQuery('');
      } else if (data.type === 'not_found') {
        // НОВОЕ: Товар не найден — открываем модалку со всеми полями
        setNewProductModal({ barcode });
        setFormData({ 
          barcode: barcode,   // НОВОЕ: штрихкод уже заполнен
          name: '', 
          price: '', 
          stock: 0,           // НОВОЕ: начальный остаток 0
          unit: 'pcs', 
          is_weighted: false, 
          category: 'other',  // НОВОЕ: категория по умолчанию
          min_stock: 6,       // НОВОЕ: минимальный остаток по умолчанию
          quantity: 1 
        });
        setSearchQuery('');
      } else {
        alert('Товар не знайдено!');
        setSearchQuery('');
      }
    } catch (err) {
      console.error(err);
      alert('Помилка мережі');
    }
  };

  // Добавление товара в список накладной
  const addItem = (product, qty) => {
    setItems(prev => {
      const existing = prev.find(item => item.product.barcode === product.barcode);
      if (existing) {
        return prev.map(item => 
          item.product.barcode === product.barcode 
            ? { ...item, quantity: +(item.quantity + qty).toFixed(3) }
            : item
        );
      }
      return [...prev, { product, quantity: qty, price: product.price }];
    });
    inputRef.current?.focus();
  };

  // Изменение количества товара в списке
  const updateQty = (barcode, delta) => {
    setItems(prev => prev.map(item => {
      if (item.product.barcode === barcode) {
        const isWeighted = item.product.is_weighted;
        const minQty = getQtyMin(isWeighted);
        const newQty = +(item.quantity + delta).toFixed(3);
        return newQty >= minQty ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  // Изменение цены товара в списке
  const updatePrice = (barcode, newPrice) => {
    setItems(prev => prev.map(item => 
      item.product.barcode === barcode ? { ...item, price: parseFloat(newPrice) || 0 } : item
    ));
  };

  // Удаление товара из списка
  const removeItem = (barcode) => {
    setItems(prev => prev.filter(item => item.product.barcode !== barcode));
  };

  // НОВОЕ: Создание нового товара с полными данными
  const handleCreateProduct = async () => {
    // Валидация всех полей
    if (!formData.barcode.trim()) return alert('Введіть штрихкод товару');
    if (!formData.name.trim()) return alert('Введіть назву товару');
    if (!formData.price || parseFloat(formData.price) <= 0) return alert('Введіть коректну ціну');
    
    const minQty = getQtyMin(formData.is_weighted);
    if (!formData.quantity || parseFloat(formData.quantity) < minQty) {
      return alert(`Мінімальна кількість для прийомки: ${minQty}`);
    }

    setIsProcessing(true);
    try {
      // НОВОЕ: Отправляем все поля как в админке Django
      const payload = {
        barcode: formData.barcode.trim(),
        name: formData.name.trim(),
        price: parseFloat(formData.price),
        stock: parseFloat(formData.stock) || 0,  // НОВОЕ: начальный остаток
        unit: formData.unit,
        is_weighted: formData.is_weighted,
        category: formData.category,             // НОВОЕ: категория
        min_stock: parseFloat(formData.min_stock) || 6  // НОВОЕ: минимальный остаток
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
      
      // Добавляем созданный товар в список накладной с указанным количеством
      addItem(createdProduct, parseFloat(formData.quantity));
      setNewProductModal(null);
    } catch (err) {
      alert(`Помилка: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Вычисление общей суммы накладной
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  // Сохранение накладной через API
  const handleSave = async () => {
    if (items.length === 0) return alert('Список товарів порожній!');
    
    setIsProcessing(true);
    try {
      const payload = {
        document_number: docNumber || undefined,
        receiving_date: receivingDate,
        supplier: selectedSupplier || undefined,
        notes: notes,
        items: items.map(item => ({
          barcode: item.product.barcode,
          quantity: item.quantity,
          price: item.price
        }))
      };

      const res = await fetch('http://127.0.0.1:8000/api/receiving-documents/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Помилка збереження');
      }
      
      const data = await res.json();
      alert(`✅ Накладну ${data.document_number} збережено!\nПрийнято ${items.length} позицій на суму ${data.total_amount} ₴\nЗалишки оновлено.`);
      
      setItems([]);
      setDocNumber('');
      setNotes('');
    } catch (err) {
      alert(`Помилка: ${err.message}`);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  // Обработка клавиш (Enter и Escape)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
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
      
      {/* ==================================================================== */}
      {/* МОДАЛЬНОЕ ОКНО СОЗДАНИЯ НОВОГО ТОВАРА (ВСЕ ПОЛЯ КАК В АДМИНКЕ)      */}
      { /* ==================================================================== */}
      {newProductModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setNewProductModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 my-8" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Новий товар</h2>
            <p className="text-sm text-gray-500 mb-4">Заповніть усі поля для створення товару в базі</p>
            
            <div className="space-y-4">
              
              {/* НОВОЕ: Штрихкод */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Штрихкод * <span className="text-xs text-gray-500 font-normal">(унікальний ідентифікатор)</span>
                </label>
                <input 
                  type="text"
                  value={formData.barcode} 
                  onChange={(e) => setFormData({...formData, barcode: e.target.value})}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  placeholder="Наприклад: 4820000000001"
                />
              </div>

              {/* НОВОЕ: Название */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Назва товару *</label>
                <input 
                  ref={nameInputRef} 
                  type="text" 
                  placeholder="Наприклад: Молоко 3.2%" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                />
              </div>
              
              {/* НОВОЕ: Два поля в ряд — Цена и Категория */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ціна (₴) *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    placeholder="0.00" 
                    value={formData.price} 
                    onChange={(e) => setFormData({...formData, price: e.target.value})} 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  />
                </div>
                {/* НОВОЕ: Категория товара */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Категорія</label>
                  <select 
                    value={formData.category} 
                    onChange={(e) => setFormData({...formData, category: e.target.value})} 
                    className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* НОВОЕ: Два поля в ряд — Единица измерения и Минимальный остаток */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Одиниця виміру</label>
                  <select 
                    value={formData.unit} 
                    onChange={(e) => setFormData({...formData, unit: e.target.value})} 
                    className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
                {/* НОВОЕ: Минимальный остаток */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Мінімальний залишок 
                    <span className="text-xs text-gray-500 font-normal"> (для попередження)</span>
                  </label>
                  <input 
                    type="number" 
                    step="0.001" 
                    min="0" 
                    value={formData.min_stock} 
                    onChange={(e) => setFormData({...formData, min_stock: e.target.value})} 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                  />
                </div>
              </div>

              {/* НОВОЕ: Начальный остаток на складе */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Початковий залишок на складі 
                  <span className="text-xs text-gray-500 font-normal"> (до прийомки)</span>
                </label>
                <input 
                  type="number" 
                  step="0.001" 
                  min="0" 
                  value={formData.stock} 
                  onChange={(e) => setFormData({...formData, stock: e.target.value})} 
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                />
              </div>

              {/* Чекбокс "Весовой товар" */}
              <label className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={formData.is_weighted} 
                  onChange={(e) => {
                    const isWeighted = e.target.checked;
                    setFormData({
                      ...formData, 
                      is_weighted: isWeighted,
                      quantity: isWeighted ? 0.1 : 1
                    });
                  }}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" 
                />
                <span className="text-sm font-semibold text-gray-700">Це ваговий товар (продається на вагу)</span>
              </label>

              {/* Разделитель */}
              <div className="border-t border-gray-200 pt-4">
                <div className="text-sm font-bold text-gray-700 mb-3">📦 Кількість для прийомки в цій накладній</div>
                
                {/* Поле количества с кнопками - и + */}
                <div className="flex items-center space-x-3">
                  <button 
                    type="button"
                    onClick={() => {
                      const step = getQtyStep(formData.is_weighted);
                      const min = getQtyMin(formData.is_weighted);
                      const newQty = Math.max(min, +(formData.quantity - step).toFixed(3));
                      setFormData({...formData, quantity: newQty});
                    }}
                    className="w-10 h-10 bg-red-100 text-red-700 rounded-full font-bold text-xl hover:bg-red-200 transition"
                  >−</button>
                  
                  <input 
                    type="number" 
                    min={getQtyMin(formData.is_weighted)}
                    step={getQtyStep(formData.is_weighted)}
                    value={formData.quantity} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || getQtyMin(formData.is_weighted);
                      setFormData({...formData, quantity: +val.toFixed(3)});
                    }}
                    className="flex-1 p-3 text-center text-xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  
                  <button 
                    type="button"
                    onClick={() => {
                      const step = getQtyStep(formData.is_weighted);
                      const newQty = +(formData.quantity + step).toFixed(3);
                      setFormData({...formData, quantity: newQty});
                    }}
                    className="w-10 h-10 bg-green-100 text-green-700 rounded-full font-bold text-xl hover:bg-green-200 transition"
                  >+</button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formData.is_weighted ? 'Крок: 0.1 (для вагових товарів)' : 'Крок: 1 (для штучних товарів)'}
                </div>
              </div>
            </div>
            
            {/* Кнопки модалки */}
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
                ✓ Створити та додати до накладної
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ОСНОВНОЙ ЭКРАН НАКЛАДНОЙ                                            */}
      {/* ==================================================================== */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">📦 Прийомка товару (Накладна)</h1>
        <button onClick={onBack} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold">
          ← До каси
        </button>
      </div>

      {/* Реквизиты накладной */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Номер накладної</label>
            <input type="text" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className="w-full p-2 border border-gray-300 rounded" placeholder="Авто (ПТ-20261014-001)" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Дата прийомки</label>
            <input type="date" value={receivingDate} onChange={(e) => setReceivingDate(e.target.value)} className="w-full p-2 border border-gray-300 rounded" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Постачальник</label>
            <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="w-full p-2 border border-gray-300 rounded bg-white">
              <option value="">— Не вказано —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Примітки</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2 border border-gray-300 rounded" rows="2" placeholder="Коментар..." />
        </div>
      </div>

      {/* Основная рабочая область */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <input 
              ref={inputRef} 
              type="text" 
              placeholder="🔍 Скануйте штрихкод з паперової накладної..." 
              className="w-full p-3 text-lg border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none" 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleScan()} 
              autoFocus 
              disabled={!!newProductModal}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="text-center text-gray-400 mt-20 text-xl">📭 Почніть сканувати товари з накладної</div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-100 text-gray-600 uppercase text-sm sticky top-0">
                  <tr>
                    <th className="p-3">Назва</th>
                    <th className="p-3">ШК</th>
                    <th className="p-3 text-center">Кількість</th>
                    <th className="p-3 text-right">Ціна</th>
                    <th className="p-3 text-right">Сума</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const isWeighted = item.product.is_weighted;
                    const step = getQtyStep(isWeighted);
                    const min = getQtyMin(isWeighted);
                    
                    return (
                      <tr key={item.product.barcode} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-semibold flex items-center gap-2">
                          {item.product.name}
                          {item.product.is_weighted && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">⚖️</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-gray-500 font-mono">{item.product.barcode}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-center space-x-2">
                            <button onClick={() => updateQty(item.product.barcode, -step)} className="w-7 h-7 bg-red-100 text-red-700 rounded-full font-bold">−</button>
                            <input 
                              type="number" 
                              min={min}
                              step={step}
                              value={formatQty(item.quantity, isWeighted)}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || min;
                                setItems(prev => prev.map(it => 
                                  it.product.barcode === item.product.barcode 
                                    ? { ...it, quantity: val >= min ? +val.toFixed(3) : min } 
                                    : it
                                ));
                              }}
                              className={`p-1 text-center border border-gray-300 rounded ${isWeighted ? 'w-20' : 'w-16'}`}
                            />
                            <button onClick={() => updateQty(item.product.barcode, step)} className="w-7 h-7 bg-green-100 text-green-700 rounded-full font-bold">+</button>
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <input 
                            type="number" 
                            step="0.01" 
                            value={item.price} 
                            onChange={(e) => updatePrice(item.product.barcode, e.target.value)} 
                            className="w-20 p-1 text-right border border-gray-300 rounded" 
                          />
                        </td>
                        <td className="p-3 text-right font-bold">{(item.quantity * item.price).toFixed(2)} ₴</td>
                        <td className="p-3 text-right">
                          <button onClick={() => removeItem(item.product.barcode)} className="text-red-500 font-bold text-xl">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Правая панель с итогами */}
        <div className="w-80 flex flex-col bg-gray-800 text-white rounded-xl shadow-lg p-6">
          <div className="text-gray-400 text-sm uppercase mb-2">Позицій</div>
          <div className="text-5xl font-bold text-blue-400 mb-6">{items.length}</div>
          <div className="text-gray-400 text-sm uppercase mb-2">Загальна сума</div>
          <div className="text-4xl font-bold text-green-400 mb-8">{totalAmount.toFixed(2)} ₴</div>

          <div className="mt-auto space-y-3">
            <button 
              onClick={handleSave} 
              disabled={isProcessing || items.length === 0} 
              className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-bold text-xl py-4 rounded-lg"
            >
              {isProcessing ? 'Збереження...' : '✅ ЗБЕРЕГТИ НАКЛАДНУ'}
            </button>
            <button 
              onClick={() => setItems([])} 
              className="w-full bg-red-900/50 hover:bg-red-900 text-red-200 font-semibold py-3 rounded-lg"
            >
              🗑 Очистити
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
