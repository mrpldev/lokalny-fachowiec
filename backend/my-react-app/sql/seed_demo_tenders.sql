-- Assign generated sample tenders to the first existing user.
-- Re-running this script does not add duplicate sample titles.
START TRANSACTION;

UPDATE users
SET experience_years = FLOOR(1 + RAND() * 15)
WHERE experience_years IS NULL;

SET @user_id = (SELECT id FROM users ORDER BY id LIMIT 1);
SELECT @user_id AS assigned_user_id;

INSERT INTO tenders
  (user_id, title, description, category, status, budget_min, budget_max, city, expires_at)
SELECT @user_id, 'Naprawa instalacji elektrycznej', 'Sprawdzenie i naprawa instalacji w mieszkaniu.', 'elektryka', 'aktywny',
       300.00, 800.00, 'Gdańsk', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
WHERE @user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tenders WHERE user_id = @user_id AND title = 'Naprawa instalacji elektrycznej');

INSERT INTO tenders
  (user_id, title, description, category, status, budget_min, budget_max, city, expires_at)
SELECT @user_id, 'Remont łazienki', 'Kompleksowy remont łazienki o powierzchni około 6 m2.', 'remont', 'aktywny',
       8000.00, 15000.00, 'Warszawa', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
WHERE @user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tenders WHERE user_id = @user_id AND title = 'Remont łazienki');

INSERT INTO tenders
  (user_id, title, description, category, status, budget_min, budget_max, city, expires_at)
SELECT @user_id, 'Montaż mebli kuchennych', 'Montaż szafek i blatu w nowej kuchni.', 'stolarstwo', 'aktywny',
       700.00, 1600.00, 'Kraków', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
WHERE @user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tenders WHERE user_id = @user_id AND title = 'Montaż mebli kuchennych');

INSERT INTO tenders
  (user_id, title, description, category, status, budget_min, budget_max, city, expires_at)
SELECT @user_id, 'Malowanie mieszkania', 'Malowanie ścian w dwupokojowym mieszkaniu.', 'malowanie', 'aktywny',
       2000.00, 4000.00, 'Wrocław', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
WHERE @user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tenders WHERE user_id = @user_id AND title = 'Malowanie mieszkania');

INSERT INTO tenders
  (user_id, title, description, category, status, budget_min, budget_max, city, expires_at)
SELECT @user_id, 'Naprawa przeciekającej rury', 'Lokalizacja i usunięcie przecieku pod zlewem.', 'hydraulika', 'aktywny',
       250.00, 900.00, 'Poznań', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY)
WHERE @user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tenders WHERE user_id = @user_id AND title = 'Naprawa przeciekającej rury');

COMMIT;
