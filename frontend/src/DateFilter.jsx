import { useState } from 'react';

export default function DateFilter({ onApply, initialPreset = 'today' }) {
  const [preset, setPreset] = useState(initialPreset);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const getDates = () => {
    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];
    
    switch (preset) {
      case 'today':
        return { start: formatDate(today), end: formatDate(today) };
      case 'yesterday': {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return { start: formatDate(y), end: formatDate(y) };
      }
      case '7days': {
        const s = new Date(today); s.setDate(s.getDate() - 6);
        return { start: formatDate(s), end: formatDate(today) };
      }
      case '30days': {
        const s = new Date(today); s.setDate(s.getDate() - 29);
        return { start: formatDate(s), end: formatDate(today) };
      }
      case 'this_month': {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: formatDate(firstDay), end: formatDate(today) };
      }
      case 'last_month': {
        const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: formatDate(firstDay), end: formatDate(lastDay) };
      }
      case 'custom':
        return { start: customStart, end: customEnd };
      default:
        return { start: formatDate(today), end: formatDate(today) };
    }
  };

  const handlePresetChange = (newPreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      setCustomStart('');
      setCustomEnd('');
    }
  };

  const handleApply = () => {
    const { start, end } = getDates();
    if (start && end) {
      onApply({ start, end, preset });
    } else {
      alert('Оберіть обидві дати');
    }
  };

  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="font-semibold text-gray-700 text-sm">📅 Період:</span>
        {[
          { key: 'today', label: 'Сьогодні' },
          { key: 'yesterday', label: 'Вчора' },
          { key: '7days', label: '7 днів' },
          { key: '30days', label: '30 днів' },
          { key: 'this_month', label: 'Цей місяць' },
          { key: 'last_month', label: 'Минулий місяць' },
          { key: 'custom', label: '🗓 Довільний' },
        ].map(p => (
          <button
            key={p.key}
            onClick={() => handlePresetChange(p.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
              preset === p.key 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-200 border border-gray-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      
      {preset === 'custom' && (
        <div className="flex items-center gap-2 mb-3">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
          <span className="text-gray-500">—</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
      )}
      
      <button
        onClick={handleApply}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition"
      >
        ✓ Застосувати фільтр
      </button>
    </div>
  );
}
