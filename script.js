document.addEventListener('DOMContentLoaded', () => {
    const calcBtn = document.getElementById('calc-btn');
    const logBtn = document.getElementById('log-btn');

    calcBtn.addEventListener('click', openCalculator);
    logBtn.addEventListener('click', openAuthPage);

});

function openCalculator() {
    window.location.href = 'calculator.html';
}

