document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('availability-form');
    const days = document.getElementById('availability-days');
    const status = document.getElementById('calendar-status');
    const preview = document.getElementById('availability-preview');
    const token = app.token();
    const weekdayNames = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];

    function renderPreview(slots) {
        preview.replaceChildren();
        const upcoming = app.upcomingSlots(slots);
        if (!upcoming.length) {
            preview.append(app.element(
                'p',
                slots.length ? 'Brak dostępnych terminów w najbliższych 14 dniach.' : 'Nie ustawiono jeszcze dostępnych terminów.',
            ));
            return;
        }
        const list = app.element('ul');
        upcoming.forEach((value) => list.append(app.element('li', value)));
        preview.append(list);
    }

    function createRow(day, slot) {
        const row = app.element('div', '', 'availability-row');
        const checkbox = app.element('input');
        checkbox.type = 'checkbox';
        checkbox.id = `availability-${day}`;
        checkbox.dataset.weekday = String(day);
        checkbox.checked = Boolean(slot);

        const label = app.element('label', weekdayNames[day - 1]);
        label.htmlFor = checkbox.id;
        const start = app.element('input');
        start.type = 'time';
        start.value = slot ? String(slot.startTime).slice(0, 5) : '09:00';
        start.setAttribute('aria-label', `Początek: ${weekdayNames[day - 1]}`);
        const end = app.element('input');
        end.type = 'time';
        end.value = slot ? String(slot.endTime).slice(0, 5) : '17:00';
        end.setAttribute('aria-label', `Koniec: ${weekdayNames[day - 1]}`);
        row.append(checkbox, label, start, end);
        return row;
    }

    async function load() {
        if (!token) {
            app.loginPrompt(status, 'Zaloguj się, aby zarządzać swoją dostępnością.');
            form.hidden = true;
            return;
        }
        try {
            const slots = await app.api('/api/me/availability', { token });
            const byDay = new Map(slots.map((slot) => [Number(slot.weekday), slot]));
            days.replaceChildren(...weekdayNames.map((_, index) => createRow(index + 1, byDay.get(index + 1))));
            renderPreview(slots);
            status.textContent = 'Ustaw tygodniowy grafik dostępności.';
        } catch (error) {
            status.textContent = error.message;
            form.hidden = true;
        }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const slots = [...days.querySelectorAll('.availability-row')].flatMap((row) => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (!checkbox.checked) return [];
            const [start, end] = row.querySelectorAll('input[type="time"]');
            return [{
                weekday: Number(checkbox.dataset.weekday),
                startTime: start.value,
                endTime: end.value,
            }];
        });

        status.textContent = 'Zapisywanie...';
        try {
            const result = await app.api('/api/me/availability', {
                method: 'PUT',
                body: { slots },
                token,
            });
            renderPreview(result.slots);
            status.textContent = 'Dostępność została zapisana.';
        } catch (error) {
            status.textContent = error.message;
        }
    });

    load();
});
