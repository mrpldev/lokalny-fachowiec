document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const search = $('professional-search');
    const citySelect = $('professional-city');
    const status = $('professionals-status');
    const list = $('professionals-list');
    const token = app.token();
    let professionals = [];
    let favorites = new Set();
    let reviewedProfessionalIds = new Set();
    let currentUserId = null;
    const coordinatesByCity = new Map();
    let mapCenter = null;
    let map;
    let layers;

    if (window.L) {
        map = L.map('professionals-map').setView([52.1, 19.2], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        layers = L.layerGroup().addTo(map);
    } else {
        status.textContent = 'Nie udało się załadować mapy. Sprawdź połączenie z internetem.';
    }

    function normalize(value) {
        return String(value || '').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pl-PL');
    }

    async function geocode(city) {
        const key = `lf-city-coordinates:${normalize(city)}`;
        try {
            const cached = localStorage.getItem(key);
            if (cached) return JSON.parse(cached);
        } catch {
            status.textContent = 'Nie można odczytać pamięci lokalizacji.';
        }

        const query = new URLSearchParams({
            name: city, countryCode: 'PL', count: '1', language: 'pl', format: 'json',
        });
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${query}`);
        if (!response.ok) return null;
        const match = (await response.json()).results?.[0];
        if (!match) return null;
        const point = { latitude: Number(match.latitude), longitude: Number(match.longitude) };
        try {
            localStorage.setItem(key, JSON.stringify(point));
        } catch {
            status.textContent = 'Nie można zapisać pamięci lokalizacji.';
        }
        return point;
    }

    async function loadCoordinates() {
        const cities = [...new Set(professionals.map((person) => person.city).filter(Boolean))];
        for (const city of cities) {
            try {
                const point = await geocode(city);
                if (point) coordinatesByCity.set(city, point);
            } catch (error) {
                console.error(`Nie udało się ustalić położenia miasta ${city}:`, error);
            }
        }
    }

    function visibleProfessionals() {
        const keyword = normalize(search.value.trim());
        const selectedCity = citySelect.value;
        return professionals.filter((person) => {
            const searchable = normalize([
                person.firstName, person.lastName, person.role, person.city, person.description,
            ].join(' '));
            if (keyword && !searchable.includes(keyword)) return false;
            if (selectedCity && person.city !== selectedCity) return false;
            return true;
        });
    }

    async function loadAvailability(id, container) {
        container.textContent = 'Ładowanie terminów...';
        try {
            const slots = await app.api(`/api/professionals/${encodeURIComponent(id)}/availability`);
            const upcoming = app.upcomingSlots(slots);
            container.replaceChildren();
            if (!upcoming.length) {
                container.append(app.element('p', 'Brak dostępnych terminów w najbliższych 14 dniach.'));
                return;
            }
            const items = app.element('ul');
            upcoming.forEach((value) => items.append(app.element('li', value)));
            container.append(items);
        } catch (error) {
            container.textContent = error.message || 'Nie udało się pobrać terminów.';
        }
    }

    async function toggleFavorite(person, button) {
        if (!token) {
            location.href = 'log.html';
            return;
        }
        const id = String(person.id);
        const isFavorite = favorites.has(id);
        button.disabled = true;
        try {
            await app.api(`/api/favorites/${encodeURIComponent(person.id)}`, {
                method: isFavorite ? 'DELETE' : 'POST',
                token,
            });
            if (isFavorite) favorites.delete(id);
            else favorites.add(id);
            button.textContent = isFavorite ? '☆ Dodaj do ulubionych' : '★ Usuń z ulubionych';
        } catch (error) {
            status.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    }

    function reviewForm(person, ratingSummary) {
        const section = app.element('details', '', 'professional-review');
        section.append(app.element('summary', 'Oceń fachowca'));

        if (!token) {
            const prompt = app.element('p', 'Zaloguj się, aby dodać ocenę.');
            const link = app.element('a', ' Przejdź do logowania');
            link.href = 'log.html';
            prompt.append(link);
            section.append(prompt);
            return section;
        }

        if (currentUserId && currentUserId === String(person.id)) {
            section.append(app.element('p', 'Nie możesz ocenić własnego profilu.'));
            return section;
        }

        if (reviewedProfessionalIds.has(String(person.id))) {
            section.append(app.element('p', 'Już oceniono tego fachowca.'));
            return section;
        }

        const form = app.element('form', '', 'review-form');
        const ratingId = `professional-rating-${person.id}`;
        const ratingLabel = app.element('label', 'Ocena:');
        ratingLabel.htmlFor = ratingId;
        const rating = app.element('select');
        rating.id = ratingId;
        rating.required = true;
        rating.append(new Option('Wybierz ocenę', ''));
        for (let value = 5; value >= 1; value -= 1) {
            rating.append(new Option(`${value} ★`, String(value)));
        }

        const commentId = `professional-comment-${person.id}`;
        const commentLabel = app.element('label', 'Komentarz (opcjonalnie):');
        commentLabel.htmlFor = commentId;
        const comment = app.element('textarea');
        comment.id = commentId;
        comment.maxLength = 5000;
        comment.rows = 3;

        const interaction = app.reviewInteractionConfirmation(
            `professional-review-interaction-${person.id}`,
            'Potwierdzam, że miałem/am kontakt z tym fachowcem.',
        );
        const submit = app.element('button', 'Dodaj ocenę');
        submit.type = 'submit';
        const feedback = app.element('p', '', 'review-status');
        feedback.setAttribute('role', 'status');
        form.append(ratingLabel, rating, commentLabel, comment, interaction.label, submit, feedback);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            submit.disabled = true;
            feedback.textContent = 'Zapisywanie oceny...';
            try {
                const result = await app.api(
                    `/api/professionals/${encodeURIComponent(person.id)}/review`,
                    {
                        method: 'POST',
                        body: {
                            rating: Number(rating.value),
                            comment: comment.value,
                            hadInteraction: interaction.checkbox.checked,
                        },
                        token,
                    },
                );
                ratingSummary.textContent =
                    `Ocena: ★ ${result.averageRating} (${result.reviewCount} opinii)`;
                form.replaceWith(app.element('p', result.message, 'review-status'));
            } catch (error) {
                feedback.textContent = error.message;
                submit.disabled = false;
            }
        });

        section.append(form);
        return section;
    }

    function createCard(person) {
        const card = app.profileCard(person);
        card.querySelector('.professional-avatar')?.remove();
        const details = card.querySelector('.professional-details');
        const ratingSummary = details.querySelector('.professional-rating');
        const actions = app.element('div', '', 'professional-actions');
        const favorite = app.element(
            'button',
            token && favorites.has(String(person.id)) ? '★ Usuń z ulubionych' : '☆ Dodaj do ulubionych',
        );
        favorite.type = 'button';
        favorite.addEventListener('click', () => toggleFavorite(person, favorite));
        actions.append(favorite);

        const schedule = app.element('details', '', 'professional-schedule');
        const summary = app.element('summary', 'Dostępne terminy');
        const content = app.element('div');
        summary.addEventListener('click', () => {
            if (!schedule.open && !schedule.dataset.loaded) {
                schedule.dataset.loaded = 'true';
                loadAvailability(person.id, content);
            }
        });
        schedule.append(summary, content);
        actions.append(schedule);
        details.append(actions);
        details.append(reviewForm(person, ratingSummary));
        return card;
    }

    function renderMap(people) {
        if (!map || !layers) return;
        layers.clearLayers();
        const groups = new Map();
        people.forEach((person) => {
            const point = coordinatesByCity.get(person.city);
            if (!point) return;
            const group = groups.get(person.city) || { point, people: [] };
            group.people.push(person);
            groups.set(person.city, group);
        });

        const points = [];
        groups.forEach((group, city) => {
            const point = [group.point.latitude, group.point.longitude];
            points.push(point);
            const marker = L.circleMarker(point, {
                radius: Math.min(8 + group.people.length, 18),
                color: '#426000',
                fillColor: '#bdd10b',
                fillOpacity: 0.8,
            });
            const popup = app.element('div');
            popup.append(app.element('strong', `${city} (${group.people.length})`));
            group.people.forEach((person) => popup.append(app.element(
                'p',
                `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Fachowiec',
            )));
            marker.bindPopup(popup).addTo(layers);
        });

        if (mapCenter) {
            map.setView([mapCenter.latitude, mapCenter.longitude], 10);
        } else if (points.length) {
            map.fitBounds(points, { padding: [24, 24], maxZoom: 10 });
        }
    }

    function render() {
        const people = visibleProfessionals();
        list.replaceChildren(...(people.length
            ? people.map(createCard)
            : [app.element('p', 'Brak fachowców spełniających wybrane kryteria.')]));
        renderMap(people);
        status.textContent = people.some((person) => !coordinatesByCity.has(person.city))
            ? 'Nie udało się ustalić położenia niektórych miast; ich profile nadal są na liście.'
            : `${people.length} fachowców w wynikach.`;
    }

    async function locateUser() {
        if (!navigator.geolocation) {
            status.textContent = 'Ta przeglądarka nie obsługuje lokalizacji.';
            return;
        }
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                mapCenter = { latitude: coords.latitude, longitude: coords.longitude };
                citySelect.value = '';
                render();
            },
            () => {
                status.textContent = 'Nie udało się pobrać lokalizacji. Sprawdź uprawnienia przeglądarki.';
            },
        );
    }

    async function load() {
        try {
            professionals = await app.api('/api/professionals');
            if (!Array.isArray(professionals)) throw new Error('API zwróciło nieprawidłową listę fachowców.');
            citySelect.replaceChildren(new Option('Cała Polska', ''));
            [...new Set(professionals.map((person) => person.city).filter(Boolean))]
                .sort().forEach((city) => citySelect.add(new Option(city, city)));

            if (token) {
                try {
                    const me = await app.api('/api/me', { token });
                    currentUserId = String(me.id);
                } catch (error) {
                    console.error('Nie udało się pobrać zalogowanego użytkownika:', error);
                }
                try {
                    const reviews = await app.api('/api/me/reviews', { token });
                    reviewedProfessionalIds = new Set(
                        reviews.map((review) => String(review.targetUserId)),
                    );
                } catch (error) {
                    console.error('Nie udało się pobrać wystawionych opinii:', error);
                }
                try {
                    const people = await app.api('/api/favorites', { token });
                    favorites = new Set(people.map((person) => String(person.id)));
                } catch (error) {
                    if (error.status === 401) {
                        sessionStorage.removeItem('authToken');
                        sessionStorage.removeItem('authUser');
                    } else {
                        console.error('Nie udało się pobrać ulubionych fachowców:', error);
                    }
                }
            }
            status.textContent = 'Ustalanie lokalizacji miast...';
            await loadCoordinates();
            render();
        } catch (error) {
            status.textContent = error.message || 'Nie udało się pobrać fachowców.';
        }
    }

    search.addEventListener('input', render);
    citySelect.addEventListener('change', () => {
        mapCenter = coordinatesByCity.get(citySelect.value) || null;
        render();
    });
    $('locate-me').addEventListener('click', locateUser);
    load();
});
