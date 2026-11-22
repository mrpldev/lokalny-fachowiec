document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('history-status');
    const list = document.getElementById('history-list');
    const token = app.token();

    if (!token) {
        app.loginPrompt(status, 'Zaloguj się, aby zobaczyć fachowców z zaakceptowanych zleceń.');
        return;
    }

    try {
        const people = await app.api('/api/me/history', { token });
        list.replaceChildren(...people.map(app.profileCard));
        status.textContent = people.length
            ? `Fachowcy ze współpracy: ${people.length}`
            : 'Nie znaleziono zaakceptowanych odpowiedzi na Twoje zlecenia.';
    } catch (error) {
        status.textContent = error.message;
    }
});
