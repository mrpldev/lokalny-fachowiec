document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const controls = [
        $('filter-keyword'),
        $('filter-category'),
        $('filter-city'),
        $('filter-status'),
        $('filter-budget'),
        $('filter-rating-from'),
        $('filter-rating-to'),
        $('sort-rating'),
        $('filter-experience'),
    ];
    const container = $('tenders-container');
    let tenders = [];
    let reviewableTenderIds = new Set();

    $('log-btn').addEventListener('click', () => { window.location.href = 'log.html'; });
    controls.forEach((control) => {
        control.addEventListener(
            control.type === 'search' || control.type === 'range' ? 'input' : 'change',
            render,
        );
    });

    function normalize(value) {
        return String(value || '').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL');
    }

    function matches(tender) {
        const keyword = normalize($('filter-keyword').value.trim());
        const searchable = normalize([
            tender.title, tender.description, tender.category, tender.city,
        ].join(' '));
        const budget = Number($('filter-budget').value);
        const maxBudget = tender.budget_max == null ? null : Number(tender.budget_max);
        const rating = tender.author_rating == null ? null : Number(tender.author_rating);
        const experience = tender.author_experience_years == null
            ? null : Number(tender.author_experience_years);
        const ratingFrom = Number($('filter-rating-from').value);
        const ratingTo = Number($('filter-rating-to').value);
        const experienceFrom = Number($('filter-experience').value);

        return (!keyword || searchable.includes(keyword))
            && (!$('filter-category').value || tender.category === $('filter-category').value)
            && (!$('filter-city').value || tender.city === $('filter-city').value)
            && (!$('filter-status').value || tender.status === $('filter-status').value)
            && (maxBudget != null ? maxBudget <= budget : budget === Number($('filter-budget').max))
            && (rating != null ? rating >= ratingFrom && rating <= ratingTo : ratingFrom === 0 && ratingTo === 5)
            && (experience != null ? experience >= experienceFrom : experienceFrom === 0);
    }

    function ratingOf(tender) {
        const rating = Number(tender.author_rating);
        return tender.author_rating == null || !Number.isFinite(rating) ? null : rating;
    }

    function createCard(tender) {
        const link = app.element('a');
        link.className = 'tender-card-link';
        link.href = `tender.html?id=${encodeURIComponent(tender.id)}`;

        const card = app.element('article', '', 'tender-card');
        const image = app.element('img');
        image.className = 'tender-card-image';
        image.src = app.tenderImage(tender.id);
        image.alt = tender.title || 'Zdjęcie zlecenia';
        image.addEventListener('error', () => image.remove(), { once: true });

        const content = app.element('div', '', 'tender-card-content');
        content.append(app.element('h2', tender.title || 'Zlecenie bez tytułu', 'tender-title'));
        content.append(app.element('p', [
            tender.category || 'Bez kategorii',
            tender.city || 'Lokalizacja niepodana',
            app.formatBudget(tender),
            app.statusLabel(tender.status),
        ].join(' · '), 'tender-meta'));
        content.append(app.element('p', tender.description || 'Brak opisu.', 'tender-description'));

        const extra = [
            app.formatDate(tender.created_at) && `Dodano: ${app.formatDate(tender.created_at)}`,
            app.formatDate(tender.expires_at) && `Wygasa: ${app.formatDate(tender.expires_at)}`,
            tender.responses_count != null && `Odpowiedzi: ${tender.responses_count}`,
            tender.author_experience_years != null
                && `Staż autora: ${tender.author_experience_years} lat`,
            tender.author_rating != null
                ? `Ocena autora: ★ ${tender.author_rating} (${tender.author_review_count} opinii)`
                : 'Autor bez opinii',
        ].filter(Boolean);
        if (extra.length) content.append(app.element('p', extra.join(' · '), 'tender-extra'));

        link.append(image, content);
        card.append(link);
        if (reviewableTenderIds.has(String(tender.id))) {
            const actions = app.element('div', '', 'tender-card-actions');
            const reviewButton = app.element('button', 'Dodaj ocenę', 'tender-review-button');
            reviewButton.type = 'button';
            reviewButton.addEventListener('click', () => {
                window.location.href = `history.html?tenderId=${encodeURIComponent(tender.id)}`;
            });
            actions.append(reviewButton);
            card.append(actions);
        }
        return card;
    }

    function render() {
        $('budget-val').textContent = `do ${Number($('filter-budget').value).toLocaleString('pl-PL')} zł`;
        $('experience-val').textContent = `od ${$('filter-experience').value} lat`;
        const filtered = tenders.filter(matches);
        const direction = $('sort-rating').value;
        const sorted = direction ? [...filtered].sort((first, second) => {
            const firstRating = ratingOf(first);
            const secondRating = ratingOf(second);
            if (firstRating == null) return secondRating == null ? 0 : 1;
            if (secondRating == null) return -1;
            return direction === 'desc' ? secondRating - firstRating : firstRating - secondRating;
        }) : filtered;
        container.replaceChildren(...(filtered.length
            ? sorted.map(createCard)
            : [app.element('p', 'Brak zleceń spełniających wybrane kryteria.', 'tenders-status')]));
    }

    function fillSelect(select, values, placeholder) {
        const selected = select.value;
        select.replaceChildren(new Option(placeholder, ''));
        values.forEach((value) => select.add(new Option(value, value)));
        if (values.includes(selected)) select.value = selected;
    }

    async function loadReviewableTenders() {
        const token = app.token();
        if (!token) return;
        try {
            const works = await app.api('/api/me/history', { token });
            if (!Array.isArray(works)) throw new Error('API zwróciło nieprawidłową historię.');
            reviewableTenderIds = new Set(
                works.filter((work) => !Number(work.hasReview))
                    .map((work) => String(work.tenderId)),
            );
            render();
        } catch (error) {
            console.error('Nie udało się pobrać zleceń możliwych do oceny:', error);
        }
    }

    async function load() {
        try {
            const data = await app.api('/api/tenders');
            if (!Array.isArray(data)) throw new Error('API zwróciło nieprawidłową listę zleceń.');
            tenders = data;
            fillSelect($('filter-category'), [...new Set(data.map((item) => item.category).filter(Boolean))].sort(), 'Wszystkie');
            fillSelect($('filter-city'), [...new Set(data.map((item) => item.city).filter(Boolean))].sort(), 'Wszystkie miasta');

            const slider = $('filter-budget');
            const wasAtDefault = Number(slider.value) === Number(slider.max);
            const max = data.reduce((value, item) => Math.max(
                value,
                item.budget_max == null ? 0 : Math.ceil(Number(item.budget_max)) || 0,
            ), 500);
            slider.max = String(max);
            if (wasAtDefault) slider.value = String(max);
            render();
            loadReviewableTenders();
        } catch (error) {
            container.replaceChildren(app.element(
                'p',
                error.message || 'Nie udało się pobrać zleceń.',
                'tenders-status tenders-error',
            ));
        }
    }

    load();
});
