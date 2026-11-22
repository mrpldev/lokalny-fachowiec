document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const fields = {
        keyword: $('filter-keyword'),
        category: $('filter-category'),
        city: $('filter-city'),
        status: $('filter-status'),
        budget: $('filter-budget'),
        ratingFrom: $('filter-rating-from'),
        ratingTo: $('filter-rating-to'),
        sortRating: $('sort-rating'),
        experience: $('filter-experience'),
    };
    const controls = Object.values(fields);
    const list = $('tenders-container');
    let tenders = [];
    let reviewableTenderIds = new Set();

    $('log-btn').addEventListener('click', () => { location.href = 'log.html'; });
    controls.forEach((control) => {
        const event = control.type === 'search' || control.type === 'range' ? 'input' : 'change';
        control.addEventListener(event, render);
    });

    function normalize(value) {
        return String(value || '').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL');
    }

    function getFilters() {
        return {
            keyword: normalize(fields.keyword.value.trim()),
            category: fields.category.value,
            city: fields.city.value,
            status: fields.status.value,
            budget: Number(fields.budget.value),
            maxBudget: Number(fields.budget.max),
            minRating: Number(fields.ratingFrom.value),
            maxRating: Number(fields.ratingTo.value),
            experience: Number(fields.experience.value),
        };
    }

    function matches(tender, filters) {
        const searchText = normalize([
            tender.title, tender.description, tender.category, tender.city,
        ].join(' '));
        const rating = tender.author_rating == null ? null : Number(tender.author_rating);
        const experience = tender.author_experience_years == null
            ? null : Number(tender.author_experience_years);
        const maxBudget = tender.budget_max == null ? null : Number(tender.budget_max);

        return (!filters.keyword || searchText.includes(filters.keyword))
            && (!filters.category || tender.category === filters.category)
            && (!filters.city || tender.city === filters.city)
            && (!filters.status || tender.status === filters.status)
            && (maxBudget == null ? filters.budget === filters.maxBudget : maxBudget <= filters.budget)
            && (rating == null
                ? filters.minRating === 0 && filters.maxRating === 5
                : rating >= filters.minRating && rating <= filters.maxRating)
            && (experience == null ? filters.experience === 0 : experience >= filters.experience);
    }

    function ratingOf(tender) {
        if (tender.author_rating == null) return null;
        const rating = Number(tender.author_rating);
        return Number.isFinite(rating) ? rating : null;
    }

    function sortByRating(items) {
        if (!fields.sortRating.value) return items;
        const direction = fields.sortRating.value === 'desc' ? -1 : 1;
        return [...items].sort((first, second) => {
            const firstRating = ratingOf(first);
            const secondRating = ratingOf(second);
            if (firstRating == null) return secondRating == null ? 0 : 1;
            if (secondRating == null) return -1;
            return (firstRating - secondRating) * direction;
        });
    }

    function createCard(tender) {
        const link = app.element('a');
        link.className = 'tender-card-link';
        link.href = `tender.html?id=${encodeURIComponent(tender.id)}`;

        const image = app.element('img');
        image.className = 'tender-card-image';
        image.src = app.tenderImage(tender.id);
        image.alt = tender.title || 'Zdjęcie zlecenia';
        image.addEventListener('error', () => image.remove(), { once: true });

        const content = app.element('div', '', 'tender-card-content');
        const summary = [
            tender.category || 'Bez kategorii',
            tender.city || 'Lokalizacja niepodana',
            app.formatBudget(tender),
            app.statusLabel(tender.status),
        ].join(' · ');
        content.append(
            app.element('h2', tender.title || 'Zlecenie bez tytułu', 'tender-title'),
            app.element('p', summary, 'tender-meta'),
            app.element('p', tender.description || 'Brak opisu.', 'tender-description'),
        );

        const extra = [
            app.formatDate(tender.created_at) && `Dodano: ${app.formatDate(tender.created_at)}`,
            app.formatDate(tender.expires_at) && `Wygasa: ${app.formatDate(tender.expires_at)}`,
            tender.responses_count != null && `Odpowiedzi: ${tender.responses_count}`,
            tender.author_experience_years != null
                && `Staż autora: ${tender.author_experience_years} lat`,
            tender.author_rating != null
                ? `Ocena autora: ★ ${tender.author_rating} (${tender.author_review_count || 0} opinii)`
                : 'Autor bez opinii',
        ].filter(Boolean);
        if (extra.length) content.append(app.element('p', extra.join(' · '), 'tender-extra'));

        link.append(image, content);
        const card = app.element('article', '', 'tender-card');
        card.append(link);

        if (reviewableTenderIds.has(String(tender.id))) {
            const button = app.element('button', 'Dodaj ocenę', 'tender-review-button');
            button.type = 'button';
            button.addEventListener('click', () => {
                location.href = `history.html?tenderId=${encodeURIComponent(tender.id)}`;
            });
            const actions = app.element('div', '', 'tender-card-actions');
            actions.append(button);
            card.append(actions);
        }
        return card;
    }

    function render() {
        $('budget-val').textContent = `do ${Number(fields.budget.value).toLocaleString('pl-PL')} zł`;
        $('experience-val').textContent = `od ${fields.experience.value} lat`;
        const filters = getFilters();
        const visibleTenders = sortByRating(tenders.filter((tender) => matches(tender, filters)));
        list.replaceChildren(...(visibleTenders.length
            ? visibleTenders.map(createCard)
            : [app.element('p', 'Brak zleceń spełniających wybrane kryteria.', 'tenders-status')]));
    }

    function fillSelect(select, values, placeholder) {
        const selected = select.value;
        select.replaceChildren(new Option(placeholder, ''));
        values.forEach((value) => select.add(new Option(value, value)));
        if (values.includes(selected)) select.value = selected;
    }

    function setBudgetLimit() {
        const slider = fields.budget;
        const isDefault = Number(slider.value) === Number(slider.max);
        const limit = tenders.reduce((highest, tender) => {
            const amount = Number(tender.budget_max);
            return tender.budget_max == null || !Number.isFinite(amount)
                ? highest : Math.max(highest, Math.ceil(amount));
        }, 500);
        slider.max = String(limit);
        if (isDefault) slider.value = String(limit);
    }

    async function loadReviewableTenders() {
        const token = app.token();
        if (!token) return;
        try {
            const works = await app.api('/api/me/history', { token });
            if (!Array.isArray(works)) throw new Error('API zwróciło nieprawidłową historię.');
            reviewableTenderIds = new Set(
                works.filter((work) => !Number(work.hasReview)).map((work) => String(work.tenderId)),
            );
            render();
        } catch (error) {
            console.error('Nie udało się pobrać zleceń możliwych do oceny:', error);
        }
    }

    async function loadTenders() {
        try {
            const data = await app.api('/api/tenders');
            if (!Array.isArray(data)) throw new Error('API zwróciło nieprawidłową listę zleceń.');
            tenders = data;
            fillSelect(
                fields.category,
                [...new Set(data.map((tender) => tender.category).filter(Boolean))].sort(),
                'Wszystkie',
            );
            fillSelect(
                fields.city,
                [...new Set(data.map((tender) => tender.city).filter(Boolean))].sort(),
                'Wszystkie miasta',
            );
            setBudgetLimit();
            render();
            loadReviewableTenders();
        } catch (error) {
            list.replaceChildren(app.element(
                'p',
                error.message || 'Nie udało się pobrać zleceń.',
                'tenders-status tenders-error',
            ));
        }
    }

    loadTenders();
});
