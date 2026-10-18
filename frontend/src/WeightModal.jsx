import { useState, useEffect, useRef } from 'react';

export default function WeightModal({ product, weight, onClose, onConfirm }) {
  const [inputWeight, setInputWeight] = useState(weight || '');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const quickWeights = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0];
  
  const unitLabel = product.unit === 'kg' ? 'кг' : 
                    product.unit === 'g' ? 'г' :
                    product.unit === 'l' ? 'л' :
                    product.unit === 'ml' ? 'мл' :
                    product.unit === 'm' ? 'м' : '';

  const total = (parseFloat(inputWeight || 0) * product.price).toFixed(2);

  const handleSubmit = () => {
    const w = parseFloat(inputWeight);
    if (!w || w <= 0) return alert('Введіть коректну вагу');
    if (w > product.stock) return alert(`Недостатньо товару. Залишок: ${product.stock} ${unitLabel}`);
    onConfirm(w);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4">
          <div className="text-sm text-gray-500 uppercase tracking-wide">Ваговий товар</div>
          <h2 className="text-2xl font-bold text-gray-800 mt-1">{product.name}</h2>
          <div className="text-gray-600 mt-1">
            ШК: {product.barcode} • Ціна: <span className="font-bold text-blue-600">{product.price} ₴/{unitLabel}</span>
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Залишок на складі: <span className="font-semibold">{product.stock} {unitLabel}</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Введіть вагу ({unitLabel}):</label>
          <input
            ref={inputRef}
            type="number"
            step="0.001"
            min="0.001"
            value={inputWeight}
            onChange={(e) => setInputWeight(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full p-4 text-3xl font-bold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
            placeholder="0.000"
          />
        </div>

        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Швидкий вибір:</div>
          <div className="grid grid-cols-4 gap-2">
            {quickWeights.map(w => (
              <button key={w} onClick={() => setInputWeight(w.toString())} className="py-2 bg-gray-100 hover:bg-blue-100 hover:text-blue-700 rounded-lg font-semibold transition">
                {w} {unitLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Разом:</span>
            <span className="text-2xl font-bold text-green-700">{total} ₴</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">{inputWeight || '0'} {unitLabel} × {product.price} ₴/{unitLabel}</div>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition">Скасувати</button>
          <button onClick={handleSubmit} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition">✓ Додати</button>
        </div>
      </div>
    </div>
  );
}
