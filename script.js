const API_URL = 'https://lokalny-fachowiec-api.onrender.com';
const categoryLabels = {
    elektryk: 'Elektryk',
    hydraulik: 'Hydraulik',
    stolarz: 'Stolarz',
};
const roleLabels = {
    majster: 'Majster',
    brygada: 'Brygada',
    firma: 'Firma',
};

document.addEventListener('DOMContentLoaded', () => {
    const calcBtn = document.getElementById('calc-btn');
    const logBtn = document.getElementById('log-btn');
    const searchInput = document.getElementById('filter-keyword');
    const categoryFilter = document.getElementById('filter-category');
    const cityFilter = document.getElementById('filter-city');
    const priceSlider = document.getElementById('filter-price');
    const priceValue = document.getElementById('price-val');
    const ratingFrom = document.getElementById('filter-rating-from');
    const ratingTo = document.getElementById('filter-rating-to');
    const experienceSlider = document.getElementById('filter-experience');
    const experienceValue = document.getElementById('experience-val');
    const professionalsContainer = document.getElementById('professionals-container');
    let professionals = [];

    calcBtn.addEventListener('click', openCalculator);
    logBtn.addEventListener('click', openlog);

    const filterControls = [
        searchInput,
        categoryFilter,
        cityFilter,
        priceSlider,
        ratingFrom,
        ratingTo,
        experienceSlider,
    ];

    filterControls.forEach((control) => {
        control.addEventListener(control.type === 'range' || control.type === 'search' ? 'input' : 'change', () => {
            updateFilterLabels();
            renderProfessionals();
        });
    });

    function updateFilterLabels() {
        priceValue.textContent = `do ${priceSlider.value} zł`;
        experienceValue.textContent = `od ${experienceSlider.value} lat`;
    }

    function updateSelectOptions(select, values, placeholder, labels = {}) {
        const selectedValue = select.value;
        select.replaceChildren(new Option(placeholder, ''));

        values.forEach((value) => {
            select.add(new Option(labels[value] || value, value));
        });

        if (values.includes(selectedValue)) {
            select.value = selectedValue;
        }
    }

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('pl-PL');
    }

    function matchesFilters(professional) {
        const keyword = normalizeText(searchInput.value.trim());
        const searchableText = normalizeText([
            professional.firstName,
            professional.lastName,
            professional.category,
            professional.city,
            professional.description,
            roleLabels[professional.role] || professional.role,
        ].join(' '));
        const rate = professional.hourlyRate == null ? null : Number(professional.hourlyRate);
        const experience = professional.experienceYears == null
            ? null
            : Number(professional.experienceYears);
        const rating = professional.averageRating == null
            ? null
            : Number(professional.averageRating);
        const minRating = Number(ratingFrom.value);
        const maxRating = Number(ratingTo.value);
        const maxRate = Number(priceSlider.value);
        const minExperience = Number(experienceSlider.value);

        if (keyword && !searchableText.includes(keyword)) return false;
        if (categoryFilter.value && professional.category !== categoryFilter.value) return false;
        if (cityFilter.value && professional.city !== cityFilter.value) return false;
        if (rate === null && maxRate < Number(priceSlider.max)) return false;
        if (rate !== null && rate > maxRate) return false;
        if (experience === null && minExperience > 0) return false;
        if (experience !== null && experience < minExperience) return false;

        if (rating === null) {
            if (minRating > 0 || maxRating < 5) return false;
        } else if (rating < minRating || rating > maxRating) {
            return false;
        }

        return true;
    }

    function makeTextElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = text;
        return element;
    }

    function getSafeAvatarUrl(value) {
        if (!value) return null;

        try {
            const url = new URL(value);
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
        } catch {
            return null;
        }
    }

    function createProfessionalCard(professional) {
        const card = document.createElement('article');
        card.className = 'professional-card';

        const avatarUrl = getSafeAvatarUrl(professional.avatarUrl);
        if (avatarUrl) {
            const avatar = document.createElement('img');
            avatar.className = 'professional-avatar';
            avatar.src = avatarUrl;
            avatar.alt = '';
            avatar.loading = 'lazy';
            card.append(avatar);
        }

        const details = document.createElement('div');
        details.className = 'professional-details';
        const fullName = `${professional.firstName || ''} ${professional.lastName || ''}`.trim();
        const heading = makeTextElement('h2', '', fullName || 'Fachowiec');
        if (professional.isVerified === true || Number(professional.isVerified) === 1) {
            heading.append(makeTextElement('span', 'verified-badge', 'Zweryfikowany'));
        }
        details.append(heading);

        const category = categoryLabels[professional.category] || professional.category || 'Brak specjalizacji';
        const location = professional.city || 'Nie podano miasta';
        const role = roleLabels[professional.role] || professional.role || 'Fachowiec';
        details.append(makeTextElement('p', 'professional-meta', `${category} · ${role} · ${location}`));

        const rate = professional.hourlyRate == null
            ? 'Nie podano stawki'
            : `${Number(professional.hourlyRate).toLocaleString('pl-PL')} zł / godz.`;
        const experience = professional.experienceYears == null
            ? 'Nie podano stażu'
            : `${professional.experienceYears} lat doświadczenia`;
        const rating = professional.averageRating == null
            ? 'Brak opinii'
            : `★ ${Number(professional.averageRating).toLocaleString('pl-PL')} (${professional.reviewCount} opinii)`;
        details.append(makeTextElement('p', 'professional-stats', `${rate} · ${experience} · ${rating}`));
        details.append(makeTextElement('p', 'professional-description', professional.description || 'Brak opisu.'));
        card.append(details);
        return card;
    }

    function renderProfessionals() {
        const matches = professionals.filter(matchesFilters);
        if (matches.length === 0) {
            professionalsContainer.replaceChildren(
                makeTextElement('p', 'professionals-status', 'Brak fachowców spełniających wybrane kryteria.'),
            );
            return;
        }

        professionalsContainer.replaceChildren(...matches.map(createProfessionalCard));
    }

    async function loadProfessionals() {
        try {
            const response = await fetch(`${API_URL}/api/professionals`);
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`API nie zwróciło JSON (HTTP ${response.status}).`);
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Nie udało się pobrać profili fachowców.');
            }
            if (!Array.isArray(data)) {
                throw new Error('API zwróciło nieprawidłową listę profili.');
            }

            professionals = data;
            updateSelectOptions(
                categoryFilter,
                [...new Set(professionals.map((person) => person.category).filter(Boolean))].sort(),
                'Wszystkie',
                categoryLabels,
            );
            updateSelectOptions(
                cityFilter,
                [...new Set(professionals.map((person) => person.city).filter(Boolean))].sort(),
                'Wszystkie miasta',
            );

            const rates = professionals
                .map((person) => Number(person.hourlyRate))
                .filter((rate, index) => (
                    professionals[index].hourlyRate != null && Number.isFinite(rate)
                ));
            const previousMax = Number(priceSlider.max);
            const wasAtDefault = Number(priceSlider.value) === previousMax;
            const maxRate = rates.reduce(
                (currentMax, rate) => Math.max(currentMax, Math.ceil(rate)),
                500,
            );
            priceSlider.max = String(maxRate);
            if (wasAtDefault) priceSlider.value = String(maxRate);

            updateFilterLabels();
            renderProfessionals();
        } catch (error) {
            professionalsContainer.replaceChildren(
                makeTextElement('p', 'professionals-status professionals-error',
                    error.message || 'Nie udało się połączyć z serwerem.'),
            );
        }
    }

    updateFilterLabels();
    loadProfessionals();
});

function openCalculator() {
    window.location.href = 'calculator.html';
}

function openlog() {
    window.location.href = 'log.html';
}
