document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logout-btn');
    if (!logoutButton) return;

    const token = app.token();
    logoutButton.hidden = !token;
    if (!token) return;

    logoutButton.addEventListener('click', async () => {
        logoutButton.disabled = true;
        try {
            await app.api('/api/logout', { method: 'POST', token });
        } catch (error) {
            console.error(error);
        } finally {
            sessionStorage.removeItem('authToken');
            sessionStorage.removeItem('authUser');
            window.location.href = 'index.html';
        }
    });
});
