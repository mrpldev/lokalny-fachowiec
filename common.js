window.app = (() => {
    const apiUrl = 'https://lokalny-fachowiec-api.onrender.com';
    const weekdays = ['Pon.', 'Wt.', 'Śr.', 'Czw.', 'Pt.', 'Sob.', 'Niedz.'];
    const statusLabels = {
        aktywny: 'Aktywne',
        zakończony: 'Zakończone',
        zamknięty: 'Zamknięte',
    };

    async function api(path, { method = 'GET', body, token } = {}) {
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (token) headers.Authorization = `Bearer ${token}`;

        let response;
        try {
            response = await fetch(`${apiUrl}${path}`, {
                method,
                headers,
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
        } catch {
            throw new Error('Nie można połączyć się z API.');
        }

        let data;
        try {
            data = await response.json();
        } catch {
            const error = new Error(
                response.status === 404
                    ? 'Ten adres API nie został opublikowany.'
                    : `API zwróciło nieprawidłową odpowiedź (HTTP ${response.status}).`,
            );
            error.status = response.status;
            throw error;
        }
        if (!response.ok) {
            const error = new Error(data.error || `Błąd API (HTTP ${response.status}).`);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function element(tag, text = '', className = '') {
        const node = document.createElement(tag);
        node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function formatBudget(tender) {
        const amount = (value) => Number(value).toLocaleString('pl-PL');
        if (tender.budget_min != null && tender.budget_max != null) {
            return `${amount(tender.budget_min)}–${amount(tender.budget_max)} zł`;
        }
        if (tender.budget_max != null) return `do ${amount(tender.budget_max)} zł`;
        if (tender.budget_min != null) return `od ${amount(tender.budget_min)} zł`;
        return 'Budżet do uzgodnienia';
    }

    function formatDate(value, fallback = '') {
        if (!value) return fallback;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString('pl-PL');
    }

    function tenderImage(id) {
        const number = ((Number(id) - 1) % 8) + 1;
        return `img/${number}.png`;
    }

    function profileCard(profile) {
        const card = element('article', '', 'professional-card');
        const details = element('div', '', 'professional-details');
        const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Fachowiec';
        details.append(element('h2', name));
        details.append(element('p', [profile.role, profile.city].filter(Boolean).join(' · ')));
        if (profile.experienceYears != null) {
            details.append(element('p', `Staż: ${profile.experienceYears} lat`));
        }
        if (profile.averageRating != null) {
            details.append(element(
                'p',
                `Ocena: ★ ${profile.averageRating} (${profile.reviewCount || 0} opinii)`,
            ));
        }
        if (profile.description) details.append(element('p', profile.description));

        if (profile.avatarUrl) {
            try {
                const url = new URL(profile.avatarUrl);
                if (url.protocol === 'https:' || url.protocol === 'http:') {
                    const image = element('img');
                    image.src = url.href;
                    image.alt = '';
                    image.className = 'professional-avatar';
                    image.loading = 'lazy';
                    card.append(image);
                }
            } catch {
                console.warn('Pominięto nieprawidłowy adres zdjęcia fachowca.');
            }
        }
        card.append(details);
        return card;
    }

    function upcomingSlots(slots, days = 14) {
        const dates = [];
        const today = new Date();
        for (let offset = 0; offset < days; offset += 1) {
            const date = new Date(today);
            date.setDate(today.getDate() + offset);
            const weekday = date.getDay() || 7;
            const slot = slots.find((item) => Number(item.weekday) === weekday);
            if (slot) {
                const day = date.toLocaleDateString('pl-PL', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                });
                dates.push(`${day}: ${String(slot.startTime).slice(0, 5)}–${String(slot.endTime).slice(0, 5)}`);
            }
        }
        return dates;
    }

    function loginPrompt(status, message) {
        status.textContent = message;
        const link = element('a', ' Przejdź do logowania');
        link.href = 'log.html';
        status.append(link);
    }

    return {
        api,
        element,
        formatBudget,
        formatDate,
        statusLabel: (status) => statusLabels[status] || status || 'Status nieznany',
        tenderImage,
        profileCard,
        upcomingSlots,
        loginPrompt,
        token: () => sessionStorage.getItem('authToken'),
        weekdays,
    };
})();
