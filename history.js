document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('history-status');
    const list = document.getElementById('history-list');
    const token = app.token();
    const tenderId = new URLSearchParams(location.search).get('tenderId');

    function reviewForm(work) {
        const section = app.element('section', '', 'review-entry');
        section.append(app.element('h3', work.tenderTitle || 'Zlecenie'));
        if (Number(work.hasReview)) {
            section.append(app.element(
                'p',
                `Opinia dodana: ${'★'.repeat(Number(work.reviewRating) || 0)}`,
            ));
            return section;
        }

        const form = app.element('form', '', 'review-form');
        const ratingId = `review-rating-${work.responseId}`;
        const ratingLabel = app.element('label', 'Ocena:');
        ratingLabel.htmlFor = ratingId;
        const rating = app.element('select');
        rating.id = ratingId;
        rating.required = true;
        rating.append(new Option('Wybierz ocenę', ''));
        for (let value = 5; value >= 1; value -= 1) {
            rating.append(new Option(`${value} ★`, String(value)));
        }

        const commentId = `review-comment-${work.responseId}`;
        const commentLabel = app.element('label', 'Komentarz (opcjonalnie):');
        commentLabel.htmlFor = commentId;
        const comment = app.element('textarea');
        comment.id = commentId;
        comment.maxLength = 5000;
        comment.rows = 3;

        const interaction = app.reviewInteractionConfirmation(
            `history-review-interaction-${work.responseId}`,
            'Potwierdzam, że miałem/am kontakt z tym fachowcem.',
        );
        const submit = app.element('button', 'Dodaj opinię');
        submit.type = 'submit';
        const feedback = app.element('p', '', 'review-status');
        feedback.setAttribute('role', 'status');
        form.append(ratingLabel, rating, commentLabel, comment, interaction.label, submit, feedback);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            submit.disabled = true;
            feedback.textContent = 'Zapisywanie opinii...';
            try {
                const result = await app.api(`/api/professionals/${encodeURIComponent(work.id)}/review`, {
                    method: 'POST',
                    body: {
                        rating: Number(rating.value),
                        comment: comment.value,
                        hadInteraction: interaction.checkbox.checked,
                    },
                    token,
                });
                form.replaceWith(app.element('p', result.message, 'review-status'));
            } catch (error) {
                feedback.textContent = error.message;
                submit.disabled = false;
            }
        });
        section.append(form);
        return section;
    }

    function renderHistory(works) {
        const people = new Map();
        works.forEach((work) => {
            const id = String(work.id);
            if (!people.has(id)) {
                const card = app.profileCard(work);
                const details = card.querySelector('.professional-details');
                const reviews = app.element('div', '', 'review-list');
                details.append(reviews);
                people.set(id, { card, reviews });
            }
            people.get(id).reviews.append(reviewForm(work));
        });
        list.replaceChildren(...[...people.values()].map(({ card }) => card));
        return people.size;
    }

    if (!token) {
        app.loginPrompt(status, 'Zaloguj się, aby zobaczyć fachowców z zaakceptowanych zleceń.');
        return;
    }

    try {
        const works = await app.api('/api/me/history', { token });
        if (!Array.isArray(works)) throw new Error('API zwróciło nieprawidłową historię.');
        const relevantWorks = tenderId
            ? works.filter((work) => String(work.tenderId) === tenderId)
            : works;
        const professionalCount = renderHistory(relevantWorks);
        status.textContent = professionalCount
            ? `Fachowcy ze współpracy: ${professionalCount}`
            : tenderId
                ? 'Brak zaakceptowanej współpracy przy tym zleceniu.'
                : 'Nie znaleziono zaakceptowanych odpowiedzi na Twoje zlecenia.';
        if (tenderId) list.querySelector('.review-entry')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
        status.textContent = error.message;
    }
});
