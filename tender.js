const TENDERS_API_URL = 'https://lokalny-fachowiec-api.onrender.com';
const TENDER_IMAGE_COUNT = 8;
const tenderStatusLabels = {
    aktywny: 'Aktywne',
    zakończony: 'Zakończone',
    zamknięty: 'Zamknięte',
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('tender-detail');
    const tenderId = new URLSearchParams(window.location.search).get('id');

    function addText(parent, tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = text;
        parent.append(element);
        return element;
    }

    function formatBudget(tender) {
        const minimum = tender.budget_min == null ? null : Number(tender.budget_min);
        const maximum = tender.budget_max == null ? null : Number(tender.budget_max);
        const formatAmount = (amount) => amount.toLocaleString('pl-PL');

        if (minimum !== null && maximum !== null) {
            return `${formatAmount(minimum)}–${formatAmount(maximum)} zł`;
        }
        if (maximum !== null) return `do ${formatAmount(maximum)} zł`;
        if (minimum !== null) return `od ${formatAmount(minimum)} zł`;
        return 'Budżet do uzgodnienia';
    }

    function formatDate(value) {
        if (!value) return 'Nie podano';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? 'Nie podano' : date.toLocaleDateString('pl-PL');
    }

    function showError(message) {
        container.replaceChildren();
        addText(container, 'p', 'tenders-status tenders-error', message);
    }

    function renderTender(tender) {
        container.replaceChildren();
        addText(container, 'h1', 'tender-detail-title', tender.title || 'Zlecenie');
        const imageNumber = ((Number(tender.id) - 1) % TENDER_IMAGE_COUNT) + 1;
        const image = document.createElement('img');
        image.className = 'tender-detail-image';
        image.src = `img/${imageNumber}.png`;
        image.alt = tender.title || 'Zdjęcie zlecenia';
        image.addEventListener('error', () => image.remove(), { once: true });
        container.append(image);

        const status = tenderStatusLabels[tender.status] || tender.status || 'Status nieznany';
        addText(
            container,
            'p',
            'tender-detail-meta',
            [tender.category, tender.city, status].filter(Boolean).join(' · '),
        );

        const facts = document.createElement('dl');
        facts.className = 'tender-detail-facts';
        const factRows = [
            ['Budżet', formatBudget(tender)],
            ['Dodano', formatDate(tender.created_at)],
            ['Termin', formatDate(tender.expires_at)],
            ['Wyświetlenia', String(tender.views_count ?? 0)],
            ['Odpowiedzi', String(tender.responses_count ?? 0)],
        ];

        if (tender.author_experience_years != null) {
            factRows.push(['Staż autora', `${tender.author_experience_years} lat`]);
        }
        if (tender.author_rating != null) {
            factRows.push([
                'Ocena autora',
                `★ ${tender.author_rating} (${tender.author_review_count} opinii)`,
            ]);
        }

        factRows.forEach(([label, value]) => {
            addText(facts, 'dt', '', label);
            addText(facts, 'dd', '', value);
        });
        container.append(facts);
        addText(container, 'h2', 'tender-description-heading', 'Opis zlecenia');
        addText(container, 'p', 'tender-detail-description', tender.description || 'Brak opisu.');
    }

    async function loadTender() {
        if (!tenderId || !/^\d+$/.test(tenderId) || Number(tenderId) < 1) {
            showError('Nieprawidłowy adres zlecenia.');
            return;
        }

        try {
            const response = await fetch(`${TENDERS_API_URL}/api/tenders/${encodeURIComponent(tenderId)}`);
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`API nie zwróciło JSON (HTTP ${response.status}).`);
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Nie udało się pobrać zlecenia.');
            }
            renderTender(data);
        } catch (error) {
            showError(error.message || 'Nie można połączyć się z serwerem.');
        }
    }

    loadTender();
});
