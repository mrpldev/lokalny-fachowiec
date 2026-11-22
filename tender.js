document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('tender-detail');
    const id = new URLSearchParams(location.search).get('id');
    const add = (parent, tag, className, text) => {
        const node = app.element(tag, text, className);
        parent.append(node);
        return node;
    };

    function reviewForm(tender, ratingValue) {
        const section = app.element('section', '', 'tender-review-section');
        const authorName = `${tender.author_first_name || ''} ${tender.author_last_name || ''}`.trim();
        add(section, 'h2', '', authorName ? `Oceń autora: ${authorName}` : 'Oceń autora zlecenia');

        const token = app.token();
        if (!token) {
            const prompt = app.element('p', 'Zaloguj się, aby dodać ocenę.');
            const link = app.element('a', ' Przejdź do logowania');
            link.href = 'log.html';
            prompt.append(link);
            section.append(prompt);
            return section;
        }

        const form = app.element('form', '', 'review-form');
        const ratingLabel = app.element('label', 'Ocena:');
        const rating = app.element('select');
        rating.required = true;
        rating.append(new Option('Wybierz ocenę', ''));
        for (let value = 5; value >= 1; value -= 1) {
            rating.append(new Option(`${value} ★`, String(value)));
        }
        ratingLabel.htmlFor = 'tender-review-rating';
        rating.id = 'tender-review-rating';

        const commentLabel = app.element('label', 'Komentarz (opcjonalnie):');
        const comment = app.element('textarea');
        commentLabel.htmlFor = 'tender-review-comment';
        comment.id = 'tender-review-comment';
        comment.maxLength = 5000;
        comment.rows = 3;

        const interaction = app.reviewInteractionConfirmation(
            'tender-review-interaction',
            'Potwierdzam, że miałem/am kontakt z autorem zlecenia.',
        );
        const submit = app.element('button', 'Zapisz ocenę');
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
                    `/api/professionals/${encodeURIComponent(tender.author_id)}/review`,
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
                ratingValue.textContent =
                    `★ ${result.averageRating} (${result.reviewCount} opinii)`;
                form.replaceWith(app.element('p', result.message, 'review-status'));
            } catch (error) {
                feedback.textContent = error.message;
                submit.disabled = false;
            }
        });

        section.append(form);
        return section;
    }

    function render(tender) {
        container.replaceChildren();
        add(container, 'h1', 'tender-detail-title', tender.title || 'Zlecenie');
        const image = app.element('img');
        image.className = 'tender-detail-image';
        image.src = app.tenderImage(tender.id);
        image.alt = tender.title || 'Zdjęcie zlecenia';
        image.addEventListener('error', () => image.remove(), { once: true });
        container.append(image);
        add(container, 'p', 'tender-detail-meta', [
            tender.category, tender.city, app.statusLabel(tender.status),
        ].filter(Boolean).join(' · '));

        const facts = app.element('dl', '', 'tender-detail-facts');
        const rows = [
            ['Budżet', app.formatBudget(tender)],
            ['Dodano', app.formatDate(tender.created_at, 'Nie podano')],
            ['Termin', app.formatDate(tender.expires_at, 'Nie podano')],
            ['Wyświetlenia', String(tender.views_count ?? 0)],
            ['Odpowiedzi', String(tender.responses_count ?? 0)],
            ['Autor', `${tender.author_first_name || ''} ${tender.author_last_name || ''}`.trim() || 'Nieznany'],
        ];
        if (tender.author_experience_years != null) {
            rows.push(['Staż autora', `${tender.author_experience_years} lat`]);
        }
        rows.forEach(([label, value]) => {
            add(facts, 'dt', '', label);
            add(facts, 'dd', '', value);
        });
        add(facts, 'dt', '', 'Ocena autora');
        const ratingValue = add(
            facts,
            'dd',
            'tender-author-rating',
            tender.author_rating != null
                ? `★ ${tender.author_rating} (${tender.author_review_count} opinii)`
                : 'Brak ocen',
        );
        container.append(facts);
        add(container, 'h2', 'tender-description-heading', 'Opis zlecenia');
        add(container, 'p', 'tender-detail-description', tender.description || 'Brak opisu.');
        container.append(reviewForm(tender, ratingValue));
    }

    if (!/^\d+$/.test(id || '') || Number(id) < 1) {
        container.replaceChildren(app.element('p', 'Nieprawidłowy adres zlecenia.', 'tenders-status tenders-error'));
        return;
    }

    try {
        render(await app.api(`/api/tenders/${encodeURIComponent(id)}`));
    } catch (error) {
        container.replaceChildren(app.element(
            'p',
            error.message || 'Nie udało się pobrać zlecenia.',
            'tenders-status tenders-error',
        ));
    }
});
