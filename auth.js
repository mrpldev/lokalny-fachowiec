document.addEventListener('DOMContentLoaded', () => {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const message = document.getElementById('auth-message');

    function showForm(isLogin) {
        loginForm.hidden = !isLogin;
        registerForm.hidden = isLogin;
        loginTab.classList.toggle('active', isLogin);
        registerTab.classList.toggle('active', !isLogin);
        loginTab.setAttribute('aria-pressed', String(isLogin));
        registerTab.setAttribute('aria-pressed', String(!isLogin));
        message.textContent = '';
    }

    async function submit(form, endpoint, loadingText, successText, onSuccess) {
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        message.textContent = loadingText;

        try {
            const result = await app.api(endpoint, {
                method: 'POST',
                body: Object.fromEntries(new FormData(form).entries()),
            });
            onSuccess(result);
            message.textContent = successText(result);
        } catch (error) {
            message.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    }

    loginTab.addEventListener('click', () => showForm(true));
    registerTab.addEventListener('click', () => showForm(false));

    loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submit(loginForm, '/api/login', 'Logowanie...', (result) => (
            `Zalogowano pomyślnie. Witaj, ${result.user.firstName}!`
        ), (result) => {
            sessionStorage.setItem('authToken', result.token);
            sessionStorage.setItem('authUser', JSON.stringify(result.user));
            loginForm.reset();
        });
    });

    registerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        submit(registerForm, '/api/register', 'Tworzenie konta...', () => (
            'Konto zostało utworzone. Możesz się zalogować.'
        ), () => {
            registerForm.reset();
            showForm(true);
        });
    });
});
