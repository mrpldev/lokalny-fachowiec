-- Change 1 to an existing users.id, then edit the example values.
SET @user_id = 1;

INSERT INTO tenders
  (user_id, title, description, category, status, budget_min, budget_max, city, expires_at)
VALUES
  (@user_id, 'Nazwa zlecenia', 'Opis zlecenia', 'remont', 'aktywny',
   1000.00, 5000.00, 'Warszawa', DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY));
