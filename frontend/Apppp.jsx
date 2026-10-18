import { useState, useEffect, useRef } from 'react';
import WeightModal from './WeightModal';
import ReceivingDocumentScreen from './ReceivingDocumentScreen';
import DateFilter from './DateFilter';

// === КОМПОНЕНТ ПАНЕЛІ КЕРУЮЧОГО ===
function ManagerDashboard({ onBack }) {
  const [activeTab, setActiveTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [invProducts, setInvProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [documentsCount, setDocumentsCount] = useState(0);
  
  // Новые состояния для просмотра чека
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  
  const today = new Date().toISOString().split('T')[0];
  const [dateFilter, setDateFilter] = useState({ start: today, end: today, preset: 'today' });
  const [docSearch, setDocSearch] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  const getUnitLabel = (unit) => {
    const labels = { pcs: 'шт', kg: 'кг', g: 'г', l: 'л', ml: 'мл', m: 'м' };
    return labels[unit] || unit;
  };

  // Функция загрузки деталей конкретного чека
  const handleViewReceipt = async (saleId) => {
    setReceiptLoading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/sales/${saleId}/`);
      const data = await res.json();
      setSelectedReceipt(data);
    } catch (err) {
      console.error('Помилка завантаження чека:', err);
    } finally {
      setReceiptLoading(false);
    }
  };

  useEffect(() => {
    const { start, end } = dateFilter;
    if (!start || !end) return;
    setLoading(true);

    if (activeTab === 'stats') {
      fetch(`http://127.0.0.1:8000/api/sales/stats/?start_date=${start}&end_date=${end}`)
        .then(res => res.json())
        .then(data => { setStats(data); setLoading(false); })
        .catch(err => { console.error(err); setLoading(false); });
    }
    
    if (activeTab === 'inventory') {
      fetch('http://127.0.0.1:8000/api/products/')
        .then(res => res.json())
        .then(data => { setInvProducts(data); setLoading(false); })
        .catch(err => { console.error(err); setLoading(false); });
    }
    
    if (activeTab === 'receipts') {
      fetch('http://127.0.0.1:8000/api/sales/')
        .then(res => res.json())
        .then(data => {
          const filtered = data.filter(sale => {
            const saleDate = new Date(sale.created_at).toISOString().split('T')[0];
            return saleDate >= start && saleDate <= end;
          });
          setSales(filtered);
          setLoading(false);
        })
        .catch(err => { console.error(err); setLoading(false); });
    }
    
    if (activeTab === 'documents') {
      let url = `http://127.0.0.1:8000/api/receiving-documents/list_with_filters/?start_date=${start}&end_date=${end}`;
      if (docSearch) url += `&search=${encodeURIComponent(docSearch)}`;
      fetch(url)
        .then(res => res.json())
        .then(data => {
          setDocuments(data.documents);
          setDocumentsTotal(data.total_sum);
          setDocumentsCount(data.count);
          setLoading(false);
        })
        .catch(err => { console.error(err); setLoading(false); });
    }
  }, [activeTab, dateFilter, docSearch]);

  const exportToCSV = () => {
    const headers = ['Номер', 'Дата', 'Постачальник', 'Позицій', 'Сума', 'Примітки'];
    const rows = documents.map(doc => [
      doc.document_number,
      doc.receiving_date,
      doc.supplier_name || '—',
      doc.items.length,
      doc.total_amount,
      doc.notes || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `nakladni_${dateFilter.start}_${dateFilter.end}.csv`;
    link.click();
  };

  return (
    // Добавляем print:hidden, чтобы при печати скрывался весь дашборд, кроме модалок
    <div className="flex flex-col h-screen bg-gray-100 p-6 print:hidden">
      
      {/* === МОДАЛЬНЕ ВІКНО ПЕРЕГЛЯДУ ТА ДРУКУ ЧЕКА === */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 print:absolute print:inset-0 print:bg-white print:z-[9999] print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 print:max-w-full print:shadow-none print:p-4" onClick={(e) => e.stopPropagation()}>
            
            {/* Кнопка закрытия (скрывается при печати) */}
            <div className="flex justify-between items-start mb-4 print:hidden">
              <h2 className="text-xl font-bold text-gray-800">Деталі чеку #{selectedReceipt.id}</h2>
              <button onClick={() => setSelectedReceipt(null)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
            </div>

            {/* Сам чек (стилизован под термопечать) */}
            <div className="font-mono text-sm space-y-3 print:text-xs print:space-y-2">
              <div className="text-center border-b border-dashed border-gray-400 pb-3">
                <div className="font-bold text-lg print:text-base">🛒 POS СИСТЕМА</div>
                <div className="text-gray-600 print:text-gray-800">Фіскальний чек</div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(selectedReceipt.created_at).toLocaleString('uk-UA')}
                </div>
              </div>

              <div className="space-y-2">
                {selectedReceipt.items && selectedReceipt.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <div className="flex-1">
                      <div className="font-semibold">{item.product_name}</div>
                      <div className="text-xs text-gray-500 print:text-gray-700">
                        {item.quantity} {getUnitLabel(item.unit)} x {item.price} ₴
                      </div>
                    </div>
                    <div className="font-bold text-right">{item.total} ₴</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-gray-400 pt-3 space-y-1">
                <div className="flex justify-between text-lg font-bold print:text-base">
                  <span>РАЗОМ:</span>
                  <span>{selectedReceipt.total} ₴</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 print:text-gray-800">
                  <span>Спосіб оплати:</span>
                  <span className="uppercase">{selectedReceipt.payment_method === 'cash' ? 'Готівка' : 'Картка'}</span>
                </div>
                {selectedReceipt.payment_method === 'cash' && selectedReceipt.amount_received && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>Отримано:</span>
                      <span>{selectedReceipt.amount_received} ₴</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Решта:</span>
                      <span>{selectedReceipt.change} ₴</span>
                    </div>
                  </>
                )}
              </div>

              <div className="text-center text-xs text-gray-500 pt-4 print:text-gray-800">
                Дякуємо за покупку!<br/>
                Звертайтесь ще!
              </div>
            </div>

            {/* Кнопка печати (скрывается при печати) */}
            <div className="mt-6 flex gap-3 print:hidden">
              <button 
                onClick={() => window.print()} 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                🖨️ Друкувати чек
              </button>
              <button 
                onClick={() => setSelectedReceipt(null)} 
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-lg transition"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === НОВОЕ: МОДАЛЬНЕ ВІКНО ПЕРЕГЛЯДУ ТА ДРУКУ НАКЛАДНОЇ === */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 print:absolute print:inset-0 print:bg-white print:z-[9999] print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto print:max-w-full print:shadow-none print:p-4" onClick={(e) => e.stopPropagation()}>
            
            {/* НОВОЕ: Шапка с кнопкой закрытия (скрывается при печати) */}
            <div className="flex justify-between items-start mb-4 print:hidden">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Накладна #{selectedDoc.document_number}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Від {new Date(selectedDoc.receiving_date).toLocaleDateString('uk-UA')}
                  {selectedDoc.supplier_name && ` • Постачальник: ${selectedDoc.supplier_name}`}
                </p>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
            </div>

            {/* НОВОЕ: Документ накладной (стилизован для печати) */}
            <div className="font-mono text-sm space-y-4 print:text-xs print:space-y-3">
              
              {/* НОВОЕ: Заголовок накладной */}
              <div className="text-center border-b-2 border-gray-400 pb-3">
                <div className="font-bold text-xl print:text-lg">📦 НАКЛАДНА ПРИЙОМКИ ТОВАРУ</div>
                <div className="text-gray-600 print:text-gray-800 mt-1">#{selectedDoc.document_number}</div>
                <div className="text-xs text-gray-500 mt-1 print:text-gray-700">
                  {new Date(selectedDoc.receiving_date).toLocaleDateString('uk-UA')}
                </div>
              </div>

              {/* НОВОЕ: Информация о поставщике */}
              {selectedDoc.supplier_name && (
                <div className="border-b border-dashed border-gray-300 pb-2">
                  <div className="text-xs text-gray-500 uppercase print:text-gray-700">Постачальник:</div>
                  <div className="font-semibold">{selectedDoc.supplier_name}</div>
                </div>
              )}

              {/* НОВОЕ: Примечания (если есть) */}
              {selectedDoc.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 print:bg-white print:border-gray-300">
                  <div className="text-xs font-semibold text-yellow-800 uppercase print:text-gray-800">Примітки:</div>
                  <div className="text-sm text-yellow-700 print:text-gray-700">{selectedDoc.notes}</div>
                </div>
              )}

              {/* НОВОЕ: Таблица товаров */}
              <div>
                <div className="text-xs text-gray-500 uppercase mb-2 print:text-gray-700">
                  Позиції ({selectedDoc.items.length}):
                </div>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-100 text-gray-600 uppercase text-xs print:bg-white print:border-b-2 print:border-gray-400">
                    <tr>
                      <th className="p-2">Товар</th>
                      <th className="p-2">ШК</th>
                      <th className="p-2 text-center">Кількість</th>
                      <th className="p-2 text-right">Ціна</th>
                      <th className="p-2 text-right">Сума</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDoc.items.map(item => (
                      <tr key={item.id} className="border-b border-gray-200 print:border-gray-300">
                        <td className="p-2 font-semibold">{item.product_name}</td>
                        <td className="p-2 text-xs text-gray-500 font-mono print:text-gray-700">{item.barcode}</td>
                        <td className="p-2 text-center">{item.quantity}</td>
                        <td className="p-2 text-right">{item.price} ₴</td>
                        <td className="p-2 text-right font-bold">{item.total} ₴</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* НОВОЕ: Итоговая сумма */}
              <div className="border-t-2 border-gray-400 pt-3">
                <div className="flex justify-between text-xl font-bold print:text-lg">
                  <span>ЗАГАЛЬНА СУМА:</span>
                  <span>{selectedDoc.total_amount} ₴</span>
                </div>
              </div>

              {/* НОВОЕ: Подпись */}
              <div className="text-center text-xs text-gray-500 pt-4 print:text-gray-700">
                Прийняв: _________________<br/>
                Поставщик: _________________
              </div>
            </div>

            {/* НОВОЕ: Кнопки управления (скрываются при печати) */}
            <div className="mt-6 flex gap-3 print:hidden">
              <button 
                onClick={() => window.print()} 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                🖨️ Друкувати накладну
              </button>
              <button 
                onClick={() => setSelectedDoc(null)} 
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-lg transition"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Заглушка загрузки чека */}
      {receiptLoading && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg shadow-lg font-semibold">Завантаження чека...</div>
        </div>
      )}

      {/* === ОСНОВНОЙ ИНТЕРФЕЙС ДАШБОРДА === */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">📊 Панель керуючого</h1>
        <div className="flex items-center space-x-3">
          <div className="flex space-x-2 bg-white p-1 rounded-lg shadow">
            {['stats', 'inventory', 'receipts', 'documents'].map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)} 
                className={`px-4 py-2 rounded-md font-semibold transition ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {tab === 'stats' && '📈 Статистика'}
                {tab === 'inventory' && '📦 Залишки'}
                {tab === 'receipts' && '🧾 Чеки'}
                {tab === 'documents' && '📄 Накладні'}
              </button>
            ))}
          </div>
          <button onClick={onBack} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold">← До каси</button>
        </div>
      </div>

      {activeTab !== 'inventory' && (
        <div className="mb-4">
          <DateFilter onApply={setDateFilter} initialPreset={dateFilter.preset} />
        </div>
      )}

      <div className="flex-1 bg-white rounded-xl shadow-lg p-6 overflow-y-auto">
        {loading && <div className="text-center text-gray-400 py-10">Завантаження...</div>}

        {/* Вкладка: Статистика */}
        {activeTab === 'stats' && !loading && (
          <div>
            {stats && stats.current ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border border-green-200">
                  <div className="text-green-700 font-semibold text-sm uppercase">Виручка за період</div>
                  <div className="text-3xl font-bold text-green-900 mt-2">{stats.current.revenue.toFixed(2)} ₴</div>
                  <div className={`mt-2 font-bold ${stats.comparison.revenue_change_percent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.comparison.revenue_change_percent > 0 ? '🔼' : '🔽'} {Math.abs(stats.comparison.revenue_change_percent)}%
                  </div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl border border-blue-200">
                  <div className="text-blue-700 font-semibold text-sm uppercase">Пробито чеків</div>
                  <div className="text-3xl font-bold text-blue-900 mt-2">{stats.current.receipts}</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-xl border border-purple-200">
                  <div className="text-purple-700 font-semibold text-sm uppercase">Середній чек</div>
                  <div className="text-3xl font-bold text-purple-900 mt-2">{stats.current.avg_check.toFixed(2)} ₴</div>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-10">Немає даних за обраний період</div>
            )}
          </div>
        )}

        {/* Вкладка: Залишки */}
        {activeTab === 'inventory' && !loading && (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 uppercase text-sm">
                <th className="p-3">Штрихкод</th>
                <th className="p-3">Назва</th>
                <th className="p-3">Ціна</th>
                <th className="p-3">Залишок</th>
              </tr>
            </thead>
            <tbody>
              {invProducts.map(p => (
                <tr key={p.id} className={`border-b ${Number(p.stock) < Number(p.min_stock || 6) ? 'bg-yellow-50' : ''}`}>
                  <td className="p-3 font-mono text-sm">{p.barcode}</td>
                  <td className="p-3 font-semibold">{p.name}</td>
                  <td className="p-3">{p.price} ₴</td>
                  <td className="p-3 font-bold">{p.stock} {p.is_weighted ? getUnitLabel(p.unit) : 'шт'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Вкладка: Чеки */}
        {activeTab === 'receipts' && !loading && (
          <div>
            <h3 className="text-xl font-bold mb-4">Чеки ({dateFilter.start} — {dateFilter.end})</h3>
            {sales.length === 0 ? (
              <div className="text-center text-gray-400 py-10">Немає чеків за обраний період</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 uppercase text-sm">
                    <th className="p-3">ID</th>
                    <th className="p-3">Час</th>
                    <th className="p-3">Оплата</th>
                    <th className="p-3 text-right">Сума</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.slice().reverse().map(sale => (
                    <tr 
                      key={sale.id} 
                      className="border-b hover:bg-gray-50 cursor-pointer transition"
                      onClick={() => handleViewReceipt(sale.id)}
                    >
                      <td className="p-3 font-mono">#{sale.id}</td>
                      <td className="p-3 text-sm">{new Date(sale.created_at).toLocaleString('uk-UA')}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${sale.payment_method === 'cash' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                          {sale.payment_method === 'cash' ? 'Готівка' : 'Картка'}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold">{sale.total} ₴</td>
                      <td className="p-3 text-right">
                        <span className="text-blue-600 hover:text-blue-800 text-sm font-semibold">Детальніше →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Вкладка: Накладні */}
        {activeTab === 'documents' && !loading && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Накладні</h3>
              <div className="flex gap-3">
                <input type="text" placeholder="🔍 Пошук..." value={docSearch} onChange={(e) => setDocSearch(e.target.value)} className="border rounded px-3 py-2 text-sm w-64" />
                <button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold text-sm">📥 Експорт CSV</button>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex justify-between">
                <div>
                  <div className="text-sm text-blue-700">Загальна сума</div>
                  <div className="text-2xl font-bold text-blue-900">{documentsTotal.toFixed(2)} ₴</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-blue-700">Кількість</div>
                  <div className="text-2xl font-bold text-blue-900">{documentsCount}</div>
                </div>
              </div>
            </div>
            {documents.length === 0 ? (
              <div className="text-center text-gray-400 py-10">Немає накладних</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 uppercase text-sm">
                    <th className="p-3">Номер</th>
                    <th className="p-3">Дата</th>
                    <th className="p-3">Постачальник</th>
                    <th className="p-3 text-center">Позицій</th>
                    <th className="p-3 text-right">Сума</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedDoc(doc)}>
                      <td className="p-3 font-mono font-semibold">{doc.document_number}</td>
                      <td className="p-3 text-sm">{new Date(doc.receiving_date).toLocaleDateString('uk-UA')}</td>
                      <td className="p-3 text-sm">{doc.supplier_name || '—'}</td>
                      <td className="p-3 text-center">{doc.items.length}</td>
                      <td className="p-3 text-right font-bold">{doc.total_amount} ₴</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// === ГОЛОВНИЙ КОМПОНЕНТ ===
function App() {
  const [currentView, setCurrentView] = useState('cashier');
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [weightModal, setWeightModal] = useState(null);
  const searchInputRef = useRef(null);

  const fetchProducts = () => {
    fetch('http://127.0.0.1:8000/api/products/')
      .then(res => res.json())
      .then(data => setProducts(data))
      .catch(err => console.error('Помилка завантаження товарів:', err));
  };

  useEffect(() => { fetchProducts(); }, []);

  const filteredProducts = products.filter(product => 
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.barcode.includes(searchQuery)
  );

  const handleAddToCart = (product, forcedWeight = null) => {
    if (product.stock <= 0) return alert('Товар закінчився!');
    if (product.is_weighted && forcedWeight === null) {
      setWeightModal({ product, weight: null });
      return;
    }
    const quantity = forcedWeight || 1;
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.barcode === product.barcode);
      if (existingItem) {
        return prevCart.map(item => item.barcode === product.barcode ? { ...item, quantity: item.quantity + quantity } : item);
      }
      return [...prevCart, { ...product, quantity }];
    });
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const handleKeyDown = async (e) => {
    if (e.key !== 'Enter' || !searchQuery.trim()) return;
    const query = searchQuery.trim();
    const found = filteredProducts[0];
    if (found) {
      handleAddToCart(found);
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/products/check_barcode/?barcode=${query}`);
      const data = await res.json();
      if (data.type === 'exact') handleAddToCart(data.product);
      else if (data.type === 'weighted') handleAddToCart(data.product, data.weight);
      else alert('Товар не знайдено!');
    } catch (err) {
      console.error(err);
      alert('Помилка перевірки штрихкоду');
    }
  };

  const updateQuantity = (barcode, delta) => {
    setCart(prevCart => prevCart.map(item => {
      if (item.barcode === barcode) {
        const newQty = +(item.quantity + delta).toFixed(3);
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const changeAmount = paymentMethod === 'cash' ? (parseFloat(receivedAmount || 0) - totalAmount) : 0;

  const handleCompleteSale = async () => {
    if (cart.length === 0) return alert('Кошик порожній!');
    if (paymentMethod === 'cash' && changeAmount < 0) return alert('Клієнт не доплатив!');

    setIsProcessing(true);
    try {
      const payload = {
        cart_items: cart.map(item => ({ barcode: item.barcode, quantity: item.quantity })),
        payment_method: paymentMethod,
        amount_received: paymentMethod === 'cash' ? parseFloat(receivedAmount) : null,
        change: paymentMethod === 'cash' ? changeAmount : null,
        receipt_printed: true,
        shift_id: 1
      };
      const response = await fetch('http://127.0.0.1:8000/api/sales/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Помилка при створенні продажу');
      }
      alert(`✅ Продаж успішний!\nСума: ${totalAmount.toFixed(2)}₴\nРешта: ${changeAmount.toFixed(2)}₴`);
      setCart([]);
      setReceivedAmount('');
      fetchProducts();
    } catch (err) {
      console.error("Помилка:", err);
      alert(`Помилка: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const ws = new WebSocket('ws://127.0.0.1:8000/ws/stock/');
    ws.onopen = () => console.log('✅ WebSocket підключено');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'stock_update') {
        setProducts(prev => prev.map(p => p.barcode === data.barcode ? { ...p, stock: data.new_stock } : p));
      }
      if (data.type === 'new_product' && data.product) {
        setProducts(prev => {
          if (prev.some(p => p.barcode === data.product.barcode)) return prev;
          return [...prev, data.product];
        });
      }
    };
    return () => ws.close();
  }, []);

  const formatQty = (qty, unit) => {
    if (unit === 'kg' || unit === 'l' || unit === 'm') return `${qty.toFixed(3)} ${unit}`;
    if (unit === 'g' || unit === 'ml') return `${Math.round(qty * 1000)} ${unit}`;
    return `${Math.round(qty)} шт`;
  };

  const getUnitLabel = (unit) => {
    const labels = { pcs: 'шт', kg: 'кг', g: 'г', l: 'л', ml: 'мл', m: 'м' };
    return labels[unit] || unit;
  };

  if (currentView === 'manager') {
    return <ManagerDashboard onBack={() => setCurrentView('cashier')} />;
  }

  if (currentView === 'document') {
    return <ReceivingDocumentScreen onBack={() => setCurrentView('cashier')} />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans text-gray-800 overflow-hidden">
      {weightModal && (
        <WeightModal
          product={weightModal.product}
          weight={weightModal.weight}
          onClose={() => setWeightModal(null)}
          onConfirm={(w) => { handleAddToCart(weightModal.product, w); setWeightModal(null); }}
        />
      )}

      <div className="bg-gray-800 text-white p-3 flex justify-between items-center shadow-md">
        <div className="font-bold text-lg"> POS Система</div>
        <div className="flex space-x-2">
          <button onClick={() => setCurrentView('document')} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg font-semibold">📦 Прийомка</button>
          <button onClick={() => setCurrentView('manager')} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-semibold">📊 Керування</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 flex flex-col border-r border-gray-300 bg-white">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <input ref={searchInputRef} type="text" placeholder="🔍 Скануйте штрихкод..." className="w-full p-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={handleKeyDown} autoFocus />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-1 gap-3">
              {filteredProducts.length === 0 ? (
                <div className="text-center text-gray-400 mt-10">Товари не знайдено</div>
              ) : (
                filteredProducts.map(product => (
                  <div key={product.id} onClick={() => handleAddToCart(product)} className={`flex justify-between items-center p-4 rounded-lg border cursor-pointer transition hover:shadow-md ${Number(product.stock) < Number(product.min_stock || 6) ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200 hover:border-blue-400'} ${product.is_weighted ? 'border-l-4 border-l-purple-500' : ''}`}>
                    <div>
                      <div className="font-bold text-lg flex items-center gap-2">
                        {product.name}
                        {product.is_weighted && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">⚖️ вага</span>}
                      </div>
                      <div className="text-sm text-gray-500">ШК: {product.barcode} • Залишок: {product.stock} {getUnitLabel(product.unit)}</div>
                    </div>
                    <div className="text-xl font-bold text-blue-600">{product.price} ₴/{getUnitLabel(product.unit)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="w-1/4 flex flex-col border-r border-gray-300 bg-gray-50">
          <div className="p-4 border-b border-gray-300 bg-gray-100 font-bold text-xl text-center">🛒 Чек ({cart.length})</div>
          <div className="flex-1 overflow-y-auto p-2">
            {cart.length === 0 ? <div className="text-center text-gray-400 mt-10">Кошик порожній</div> : cart.map(item => (
              <div key={item.barcode} className="bg-white p-3 rounded-lg shadow-sm mb-2 border border-gray-200">
                <div className="font-semibold text-sm truncate flex items-center gap-1">{item.name}{item.is_weighted && <span className="text-xs text-purple-600">⚖️</span>}</div>
                <div className="text-xs text-gray-500">{item.price} ₴/{getUnitLabel(item.unit)}</div>
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center space-x-2">
                    <button onClick={() => updateQuantity(item.barcode, item.is_weighted ? -0.1 : -1)} className="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-full font-bold">−</button>
                    <span className="font-bold w-16 text-center text-sm">{formatQty(item.quantity, item.unit)}</span>
                    <button onClick={() => updateQuantity(item.barcode, item.is_weighted ? 0.1 : 1)} className="w-8 h-8 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full font-bold">+</button>
                  </div>
                  <div className="font-bold text-blue-600">{(item.price * item.quantity).toFixed(2)} ₴</div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 bg-white border-t border-gray-300">
            <div className="flex justify-between text-lg font-bold"><span>Проміжний підсумок:</span><span>{totalAmount.toFixed(2)} ₴</span></div>
          </div>
        </div>

        <div className="w-1/4 flex flex-col bg-gray-800 text-white">
          <div className="p-6 text-center border-b border-gray-700">
            <div className="text-gray-400 text-sm uppercase tracking-wider">До сплати</div>
            <div className="text-5xl font-bold text-green-400 mt-2">{totalAmount.toFixed(2)} ₴</div>
          </div>
          <div className="flex-1 p-6 flex flex-col space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setPaymentMethod('card')} className={`p-4 rounded-lg font-bold text-lg transition ${paymentMethod === 'card' ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-700'}`}>💳 Картка</button>
              <button onClick={() => setPaymentMethod('cash')} className={`p-4 rounded-lg font-bold text-lg transition ${paymentMethod === 'cash' ? 'bg-green-600 ring-2 ring-green-400' : 'bg-gray-700'}`}>💵 Готівка</button>
            </div>
            {paymentMethod === 'cash' && (
              <div className="bg-gray-700 p-4 rounded-lg">
                <label className="block text-sm text-gray-300 mb-1">Отримано:</label>
                <input type="number" className="w-full p-3 text-2xl font-bold bg-gray-800 border border-gray-600 rounded text-white" value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} placeholder="0" />
                <div className={`mt-3 text-right text-2xl font-bold ${changeAmount < 0 ? 'text-red-400' : 'text-yellow-400'}`}>Решта: {changeAmount >= 0 ? changeAmount.toFixed(2) : '0.00'} ₴</div>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-700 space-y-3">
            <button onClick={handleCompleteSale} disabled={isProcessing || cart.length === 0} className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-bold text-2xl py-4 rounded-lg shadow-lg transition">
              {isProcessing ? 'Обробка...' : '✅ ЗАВЕРШИТИ'}
            </button>
            <button onClick={() => setCart([])} className="w-full bg-red-900/50 hover:bg-red-900 text-red-200 font-semibold py-3 rounded-lg">🗑 Очистити</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
