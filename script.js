const API_URL = 'https://lokalny-fachowiec-api.onrender.com';
const statusLabels = {
    aktywny: 'Aktywne',
    zakończony: 'Zakończone',
    zamknięty: 'Zamknięte',
};

document.addEventListener('DOMContentLoaded', () => {
    const calcBtn = document.getElementById('calc-btn');
    const logBtn = document.getElementById('log-btn');
    const searchInput = document.getElementById('filter-keyword');
    const categoryFilter = document.getElementById('filter-category');
    const cityFilter = document.getElementById('filter-city');
    const statusFilter = document.getElementById('filter-status');
    const budgetSlider = document.getElementById('filter-budget');
    const budgetValue = document.getElementById('budget-val');
    const ratingFrom = document.getElementById('filter-rating-from');
    const ratingTo = document.getElementById('filter-rating-to');
    const experienceSlider = document.getElementById('filter-experience');
    const experienceValue = document.getElementById('experience-val');
    const tendersContainer = document.getElementById('tenders-container');
    let tenders = [];

    calcBtn.addEventListener('click', openCalculator);
    logBtn.addEventListener('click', openlog);

    [
        searchInput,
        categoryFilter,
        cityFilter,
        statusFilter,
        budgetSlider,
        ratingFrom,
        ratingTo,
        experienceSlider,
    ].forEach((control) => {
        const eventName = control.type === 'search' || control.type === 'range' ? 'input' : 'change';
        control.addEventListener(eventName, () => {
            updateBudgetLabel();
            updateExperienceLabel();
            renderTenders();
        });
    });

    function updateBudgetLabel() {
        budgetValue.textContent = `do ${Number(budgetSlider.value).toLocaleString('pl-PL')} zł`;
    }

    function updateExperienceLabel() {
        experienceValue.textContent = `od ${experienceSlider.value} lat`;
    }

    function updateSelectOptions(select, values, placeholder) {
        const selectedValue = select.value;
        select.replaceChildren(new Option(placeholder, ''));

        values.forEach((value) => select.add(new Option(value, value)));
        if (values.includes(selectedValue)) select.value = selectedValue;
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('pl-PL');
    }

    function matchesFilters(tender) {
        const keyword = normalizeText(searchInput.value.trim());
        const searchableText = normalizeText([
            tender.title,
            tender.description,
            tender.category,
            tender.city,
        ].join(' '));
        const maxBudget = Number(budgetSlider.value);
        const tenderMaxBudget = tender.budget_max == null ? null : Number(tender.budget_max);
        const rating = tender.author_rating == null ? null : Number(tender.author_rating);
        const experience = tender.author_experience_years == null
            ? null
            : Number(tender.author_experience_years);
        const minRating = Number(ratingFrom.value);
        const maxRating = Number(ratingTo.value);
        const minExperience = Number(experienceSlider.value);

        if (keyword && !searchableText.includes(keyword)) return false;
        if (categoryFilter.value && tender.category !== categoryFilter.value) return false;
        if (cityFilter.value && tender.city !== cityFilter.value) return false;
        if (statusFilter.value && tender.status !== statusFilter.value) return false;
        if (tenderMaxBudget === null && maxBudget < Number(budgetSlider.max)) return false;
        if (tenderMaxBudget !== null && tenderMaxBudget > maxBudget) return false;
        if (rating === null) {
            if (minRating > 0 || maxRating < 5) return false;
        } else if (rating < minRating || rating > maxRating) {
            return false;
        }
        if (experience === null && minExperience > 0) return false;
        if (experience !== null && experience < minExperience) return false;
        return true;
    }

    function makeTextElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = text;
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
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toLocaleDateString('pl-PL');
    }

    function createTenderCard(tender) {
        const card = document.createElement('article');
        card.className = 'tender-card';
        card.append(makeTextElement('h2', 'tender-title', tender.title || 'Zlecenie bez tytułu'));

        const details = [
            tender.category || 'Bez kategorii',
            tender.city || 'Lokalizacja niepodana',
            formatBudget(tender),
            statusLabels[tender.status] || tender.status || 'Status nieznany',
        ];
        card.append(makeTextElement('p', 'tender-meta', details.join(' · ')));
        card.append(makeTextElement('p', 'tender-description', tender.description || 'Brak opisu.'));

        const extraDetails = [];
        const createdAt = formatDate(tender.created_at);
        const expiresAt = formatDate(tender.expires_at);
        if (createdAt) extraDetails.push(`Dodano: ${createdAt}`);
        if (expiresAt) extraDetails.push(`Wygasa: ${expiresAt}`);
        if (tender.responses_count != null) extraDetails.push(`Odpowiedzi: ${tender.responses_count}`);
        if (tender.author_experience_years != null) {
            extraDetails.push(`Staż autora: ${tender.author_experience_years} lat`);
        }
        if (tender.author_rating != null) {
            extraDetails.push(`Ocena autora: ★ ${tender.author_rating} (${tender.author_review_count} opinii)`);
        } else {
            extraDetails.push('Autor bez opinii');
        }
        if (extraDetails.length) {
            card.append(makeTextElement('p', 'tender-extra', extraDetails.join(' · ')));
        }

        return card;
    }

    function renderTenders() {
        const matchingTenders = tenders.filter(matchesFilters);
        if (matchingTenders.length === 0) {
            tendersContainer.replaceChildren(
                makeTextElement('p', 'tenders-status', 'Brak zleceń spełniających wybrane kryteria.'),
            );
            return;
        }

        tendersContainer.replaceChildren(...matchingTenders.map(createTenderCard));
    }

    async function loadTenders() {
        try {
            const response = await fetch(`${API_URL}/api/tenders`);
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`API nie zwróciło JSON (HTTP ${response.status}).`);
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Nie udało się pobrać zleceń.');
            }
            if (!Array.isArray(data)) {
                throw new Error('API zwróciło nieprawidłową listę zleceń.');
            }

            tenders = data;
            updateSelectOptions(
                categoryFilter,
                [...new Set(tenders.map((tender) => tender.category).filter(Boolean))].sort(),
                'Wszystkie',
            );
            updateSelectOptions(
                cityFilter,
                [...new Set(tenders.map((tender) => tender.city).filter(Boolean))].sort(),
                'Wszystkie miasta',
            );

            const previousMax = Number(budgetSlider.max);
            const wasAtDefault = Number(budgetSlider.value) === previousMax;
            const maxBudget = tenders.reduce((currentMax, tender) => {
                const amount = tender.budget_max == null ? 0 : Number(tender.budget_max);
                return Number.isFinite(amount) ? Math.max(currentMax, Math.ceil(amount)) : currentMax;
            }, 500);
            budgetSlider.max = String(maxBudget);
            if (wasAtDefault) budgetSlider.value = String(maxBudget);

            updateBudgetLabel();
            renderTenders();
        } catch (error) {
            tendersContainer.replaceChildren(
                makeTextElement('p', 'tenders-status tenders-error',
                    error.message || 'Nie udało się połączyć z serwerem.'),
            );
        }
    }

    updateBudgetLabel();
    updateExperienceLabel();
    loadTenders();
});

function openCalculator() {
    window.location.href = 'calculator.html';
}

function openlog() {
    window.location.href = 'log.html';
}
