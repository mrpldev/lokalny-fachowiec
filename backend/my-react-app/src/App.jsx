import { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadTenders() {
      try {
        const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3001')
          .replace(/\/$/, '');
        const response = await fetch(`${apiUrl}/api/tenders`, {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось загрузить данные');
        }

        setTenders(data);
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

    loadTenders();
    return () => controller.abort();
  }, []);

  const columns = tenders.length > 0 ? Object.keys(tenders[0]) : [];

  return (
    <main className="tenders-page">
      <h1>Заказы</h1>
      {loading && <p>Загрузка...</p>}
      {error && <p className="tenders-error">{error}</p>}
      {!loading && !error && tenders.length === 0 && (
        <p>Заказов пока нет.</p>
      )}
      {!loading && !error && tenders.length > 0 && (
        <div className="tenders-table-wrap">
          <table className="tenders-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenders.map((tender) => (
                <tr key={tender.id}>
                  {columns.map((column) => (
                    <td key={column}>
                      {tender[column] == null
                        ? '—'
                        : typeof tender[column] === 'object'
                          ? JSON.stringify(tender[column])
                          : String(tender[column])}
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