ALTER TABLE users
  ADD COLUMN category VARCHAR(100) NULL,
  ADD COLUMN hourly_rate DECIMAL(10, 2) NULL,
  ADD COLUMN experience_years INT NULL;
