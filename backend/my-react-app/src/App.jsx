import { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadItems() {
      try {
        const response = await fetch('http://localhost:3001/api/items', {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось загрузить данные');
        }

        setItems(data);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadItems();
    return () => controller.abort();
  }, []);

  const columns = items.length > 0 ? Object.keys(items[0]) : [];

  return (
    <main className="items-page">
      <h1>Записи из базы данных</h1>
      {loading && <p>Загрузка...</p>}
      {error && <p className="items-error">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p>В таблице items пока нет записей.</p>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id ?? index}>
                  {columns.map((column) => (
                    <td key={column}>
                      {item[column] == null
                        ? '—'
                        : typeof item[column] === 'object'
                          ? JSON.stringify(item[column])
                          : String(item[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default App;