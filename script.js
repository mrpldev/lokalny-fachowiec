document.addEventListener('DOMContentLoaded', () => {
    const calcBtn = document.getElementById('calc-btn');
    const priceSlider = document.getElementById('filter-price');
    const priceValue = document.getElementById('price-val');
    const experienceSlider = document.getElementById('filter-experience');
    const experienceValue = document.getElementById('experience-val');

    calcBtn.addEventListener('click', openCalculator);

    priceSlider.addEventListener('input', () => {
        priceValue.textContent = `${priceSlider.value} zł`;
    });

    experienceSlider.addEventListener('input', () => {
        experienceValue.textContent = `${experienceSlider.value} lat`;
    });
});

function openCalculator() {
    window.location.href = 'calculator.html';
}
