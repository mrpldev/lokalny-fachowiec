document.addEventListener('DOMContentLoaded', () => {
    const calcBtn = document.getElementById('calc-btn');
    const logBtn = document.getElementById('log-btn');
    const priceSlider = document.getElementById('filter-price');
    const priceValue = document.getElementById('price-val');
    const experienceSlider = document.getElementById('filter-experience');
    const experienceValue = document.getElementById('experience-val');

    calcBtn.addEventListener('click', openCalculator);
    logBtn.addEventListener('click', openlog);

    priceSlider.addEventListener('input', () => {
        priceValue.textContent = `${priceSlider.value} zł`;
    });

    experienceSlider.addEventListener('input', () => {
        experienceValue.textContent = `od ${experienceSlider.value} lat`;
    });
});

function openCalculator() {
    window.location.href = 'calculator.html';
}

function openlog() {
    window.location.href = 'log.html';
}
