document.addEventListener('DOMContentLoaded', () => {
    const status = document.getElementById('favorites-status');
    const list = document.getElementById('favorites-list');
    const token = app.token();

    async function remove(id, card, button) {
        button.disabled = true;
        try {
            await app.api(`/api/favorites/${encodeURIComponent(id)}`, { method: 'DELETE', token });
            card.remove();
            if (!list.children.length) status.textContent = 'Nie masz jeszcze ulubionych fachowców.';
        } catch (error) {
            status.textContent = error.message;
            button.disabled = false;
        }
    }

    async function load() {
        if (!token) {
            app.loginPrompt(status, 'Zaloguj się, aby zobaczyć ulubionych fachowców.');
            return;
        }
        try {
            const people = await app.api('/api/favorites', { token });
            list.replaceChildren(...people.map((person) => {
                const card = app.profileCard(person);
                const button = app.element('button', 'Usuń z ulubionych');
                button.type = 'button';
                button.addEventListener('click', () => remove(person.id, card, button));
                card.querySelector('.professional-details').append(button);
                return card;
            }));
            status.textContent = people.length
                ? `Ulubieni fachowcy: ${people.length}`
                : 'Nie masz jeszcze ulubionych fachowców.';
        } catch (error) {
            status.textContent = error.message;
        }
    }

    load();
});
