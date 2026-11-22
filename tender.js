document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('tender-detail');
    const id = new URLSearchParams(location.search).get('id');
    const add = (parent, tag, className, text) => {
        const node = app.element(tag, text, className);
        parent.append(node);
        return node;
    };

    function render(tender) {
        container.replaceChildren();
        add(container, 'h1', 'tender-detail-title', tender.title || 'Zlecenie');
        const image = app.element('img');
        image.className = 'tender-detail-image';
        image.src = app.tenderImage(tender.id);
        image.alt = tender.title || 'Zdjęcie zlecenia';
        image.addEventListener('error', () => image.remove(), { once: true });
        container.append(image);
        add(container, 'p', 'tender-detail-meta', [
            tender.category, tender.city, app.statusLabel(tender.status),
        ].filter(Boolean).join(' · '));

        const facts = app.element('dl', '', 'tender-detail-facts');
        const rows = [
            ['Budżet', app.formatBudget(tender)],
            ['Dodano', app.formatDate(tender.created_at, 'Nie podano')],
            ['Termin', app.formatDate(tender.expires_at, 'Nie podano')],
            ['Wyświetlenia', String(tender.views_count ?? 0)],
            ['Odpowiedzi', String(tender.responses_count ?? 0)],
        ];
        if (tender.author_experience_years != null) {
            rows.push(['Staż autora', `${tender.author_experience_years} lat`]);
        }
        if (tender.author_rating != null) {
            rows.push(['Ocena autora', `★ ${tender.author_rating} (${tender.author_review_count} opinii)`]);
        }
        rows.forEach(([label, value]) => {
            add(facts, 'dt', '', label);
            add(facts, 'dd', '', value);
        });
        container.append(facts);
        add(container, 'h2', 'tender-description-heading', 'Opis zlecenia');
        add(container, 'p', 'tender-detail-description', tender.description || 'Brak opisu.');
    }

    if (!/^\d+$/.test(id || '') || Number(id) < 1) {
        container.replaceChildren(app.element('p', 'Nieprawidłowy adres zlecenia.', 'tenders-status tenders-error'));
        return;
    }

    try {
        render(await app.api(`/api/tenders/${encodeURIComponent(id)}`));
    } catch (error) {
        container.replaceChildren(app.element(
            'p',
            error.message || 'Nie udało się pobrać zlecenia.',
            'tenders-status tenders-error',
        ));
    }
});
