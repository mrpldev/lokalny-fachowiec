import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(appDirectory, '.env.local') });
dotenv.config({ path: resolve(appDirectory, '.env') });

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN
  || 'http://localhost:5173,http://localhost:5500,http://127.0.0.1:5500')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '10kb' }));

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? {} : undefined,
});

const scrypt = promisify(scryptCallback);
const allowedRoles = new Set(['majster', 'brygada', 'firma']);
const dummySalt = '0123456789abcdef0123456789abcdef';

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
  const match = /^scrypt\$([a-f\d]{32})\$([a-f\d]{128})$/i.exec(passwordHash || '');
  if (!match) {
    await scrypt(password, dummySalt, 64);
    return false;
  }

  const [, salt, storedKeyHex] = match;
  const storedKey = Buffer.from(storedKeyHex, 'hex');
  const derivedKey = await scrypt(password, salt, storedKey.length);
  return timingSafeEqual(derivedKey, storedKey);
}

async function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const tokenMatch = /^Bearer ([a-f\d]{64})$/i.exec(authorization);
  if (!tokenMatch) {
    return res.status(401).json({ error: 'Zaloguj się, aby kontynuować.' });
  }

  const tokenHash = createHash('sha256').update(tokenMatch[1]).digest('hex');
  try {
    const [rows] = await db.execute(
      `SELECT user_id FROM sessions
       WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [tokenHash],
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Sesja wygasła. Zaloguj się ponownie.' });
    }

    req.auth = { userId: rows[0].user_id, tokenHash };
    return next();
  } catch (error) {
    console.error('Błąd weryfikacji sesji:', error);
    return res.status(500).json({ error: 'Nie udało się zweryfikować sesji.' });
  }
}

app.post('/api/register', async (req, res) => {
  const {
    email,
    phone,
    password,
    firstName,
    lastName,
    role,
    experienceYears,
    city,
    description,
  } = req.body || {};

  const values = {
    email,
    phone,
    password,
    firstName,
    lastName,
    role,
    experienceYears,
    city,
    description,
  };
  for (const [field, value] of Object.entries(values)) {
    if (value !== undefined && typeof value !== 'string') {
      return res.status(400).json({ error: `Nieprawidłowa wartość pola: ${field}` });
    }
  }

  const normalizedEmail = email?.trim().toLowerCase();
  const normalizedPhone = phone?.trim();
  const normalizedFirstName = firstName?.trim();
  const normalizedLastName = lastName?.trim();
  const normalizedRole = role?.trim();
  const normalizedCity = city?.trim() || null;
  const normalizedDescription = description?.trim() || null;
  const parsedExperienceYears = Number(experienceYears);

  if (!normalizedEmail || normalizedEmail.length > 255
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Podaj prawidłowy adres e-mail.' });
  }
  if (!normalizedPhone || normalizedPhone.length > 50) {
    return res.status(400).json({ error: 'Podaj numer telefonu (maksymalnie 50 znaków).' });
  }
  if (!normalizedFirstName || normalizedFirstName.length > 100
      || !normalizedLastName || normalizedLastName.length > 100) {
    return res.status(400).json({ error: 'Podaj imię i nazwisko (maksymalnie 100 znaków każde).' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Hasło musi mieć od 8 do 128 znaków.' });
  }
  if (!allowedRoles.has(normalizedRole)) {
    return res.status(400).json({ error: 'Wybierz prawidłowy typ konta.' });
  }
  if (!/^\d+$/.test(experienceYears || '') || parsedExperienceYears > 80) {
    return res.status(400).json({ error: 'Staż musi być liczbą całkowitą od 0 do 80 lat.' });
  }
  if ((normalizedCity && normalizedCity.length > 100)
      || (normalizedDescription && Buffer.byteLength(normalizedDescription, 'utf8') > 65535)) {
    return res.status(400).json({ error: 'Miasto lub opis są zbyt długie.' });
  }

  try {
    const passwordHash = await hashPassword(password);
    const [result] = await db.execute(
      `INSERT INTO users
        (email, phone, password_hash, first_name, last_name, role, experience_years,
         city, registered_at, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?)`,
      [
        normalizedEmail,
        normalizedPhone,
        passwordHash,
        normalizedFirstName,
        normalizedLastName,
        normalizedRole,
        parsedExperienceYears,
        normalizedCity,
        normalizedDescription,
      ],
    );

    return res.status(201).json({
      message: 'Konto zostało utworzone.',
      user: {
        id: result.insertId,
        email: normalizedEmail,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        role: normalizedRole,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Konto z tym adresem e-mail lub numerem telefonu już istnieje.' });
    }

    console.error('Błąd rejestracji użytkownika:', error);
    return res.status(500).json({ error: 'Nie udało się utworzyć konta.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string'
      || !email.trim() || !password || password.length > 128) {
    return res.status(400).json({ error: 'Podaj adres e-mail i hasło.' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, email, password_hash, first_name, last_name, role
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email.trim().toLowerCase()],
    );
    const user = rows[0];
    const passwordMatches = await verifyPassword(password, user?.password_hash);

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło.' });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await db.execute('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    await db.execute(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY))`,
      [user.id, tokenHash],
    );

    return res.json({
      message: 'Zalogowano pomyślnie.',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Błąd logowania użytkownika:', error);
    return res.status(500).json({ error: 'Nie udało się zalogować.' });
  }
});

app.post('/api/logout', authenticate, async (req, res) => {
  try {
    await db.execute('DELETE FROM sessions WHERE token_hash = ?', [req.auth.tokenHash]);
    return res.json({ message: 'Wylogowano.' });
  } catch (error) {
    console.error('Błąd wylogowania:', error);
    return res.status(500).json({ error: 'Nie udało się wylogować.' });
  }
});

app.get('/api/me', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, first_name AS firstName, last_name AS lastName, role
       FROM users WHERE id = ? LIMIT 1`,
      [req.auth.userId],
    );
    if (!rows.length) return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
    return res.json(rows[0]);
  } catch (error) {
    console.error('Błąd pobierania profilu użytkownika:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać profilu.' });
  }
});

app.get('/api/professionals', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT u.id, u.first_name AS firstName, u.last_name AS lastName,
             u.role, u.city, u.description, u.avatar_url AS avatarUrl,
             u.experience_years AS experienceYears, u.is_verified AS isVerified,
             review_stats.average_rating AS averageRating,
             COALESCE(review_stats.review_count, 0) AS reviewCount
      FROM users u
      LEFT JOIN (
        SELECT target_user_id, ROUND(AVG(rating), 1) AS average_rating,
               COUNT(rating) AS review_count
        FROM reviews
        GROUP BY target_user_id
      ) AS review_stats ON review_stats.target_user_id = u.id
      WHERE u.city IS NOT NULL AND u.city <> ''
      ORDER BY u.registered_at DESC, u.id DESC
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Błąd pobierania fachowców:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać fachowców.' });
  }
});

app.get('/api/favorites', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT u.id, u.first_name AS firstName, u.last_name AS lastName,
             u.role, u.city, u.description, u.avatar_url AS avatarUrl,
             u.experience_years AS experienceYears
      FROM favorites f
      JOIN users u ON u.id = f.professional_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `, [req.auth.userId]);
    return res.json(rows);
  } catch (error) {
    console.error('Błąd pobierania ulubionych fachowców:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać ulubionych.' });
  }
});

app.post('/api/favorites/:professionalId', authenticate, async (req, res) => {
  const professionalId = Number(req.params.professionalId);
  if (!Number.isSafeInteger(professionalId) || professionalId < 1
      || String(professionalId) === String(req.auth.userId)) {
    return res.status(400).json({ error: 'Nieprawidłowy fachowiec.' });
  }

  try {
    const [users] = await db.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [professionalId]);
    if (!users.length) return res.status(404).json({ error: 'Nie znaleziono fachowca.' });

    await db.execute(
      'INSERT IGNORE INTO favorites (user_id, professional_id) VALUES (?, ?)',
      [req.auth.userId, professionalId],
    );
    return res.status(200).json({ message: 'Dodano do ulubionych.' });
  } catch (error) {
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ error: 'Nie znaleziono fachowca.' });
    }
    console.error('Błąd dodawania ulubionego fachowca:', error);
    return res.status(500).json({ error: 'Nie udało się dodać do ulubionych.' });
  }
});

app.delete('/api/favorites/:professionalId', authenticate, async (req, res) => {
  const professionalId = Number(req.params.professionalId);
  if (!Number.isSafeInteger(professionalId) || professionalId < 1) {
    return res.status(400).json({ error: 'Nieprawidłowy fachowiec.' });
  }

  try {
    await db.execute(
      'DELETE FROM favorites WHERE user_id = ? AND professional_id = ?',
      [req.auth.userId, professionalId],
    );
    return res.json({ message: 'Usunięto z ulubionych.' });
  } catch (error) {
    console.error('Błąd usuwania ulubionego fachowca:', error);
    return res.status(500).json({ error: 'Nie udało się usunąć z ulubionych.' });
  }
});

app.get('/api/me/history', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT u.id, u.first_name AS firstName, u.last_name AS lastName,
             u.role, u.city, u.description, u.avatar_url AS avatarUrl,
             u.experience_years AS experienceYears,
             r.id AS responseId, t.id AS tenderId, t.title AS tenderTitle,
             EXISTS (
               SELECT 1 FROM reviews rv
               WHERE rv.response_id = r.id
                 AND rv.reviewer_id = t.user_id
                 AND rv.target_user_id = r.user_id
             ) AS hasReview,
             (
               SELECT rv.rating FROM reviews rv
               WHERE rv.response_id = r.id
                 AND rv.reviewer_id = t.user_id
                 AND rv.target_user_id = r.user_id
               ORDER BY rv.id DESC
               LIMIT 1
             ) AS reviewRating
      FROM tenders t
      JOIN responses r ON r.tender_id = t.id AND r.status = 'zaakceptowany'
      JOIN users u ON u.id = r.user_id
      WHERE t.user_id = ?
      ORDER BY u.last_name, u.first_name, t.created_at DESC
    `, [req.auth.userId]);
    return res.json(rows);
  } catch (error) {
    console.error('Błąd pobierania historii fachowców:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać historii.' });
  }
});

app.post('/api/me/history/:responseId/review', authenticate, async (req, res) => {
  const responseId = Number(req.params.responseId);
  const { rating, comment } = req.body || {};
  const reviewComment = typeof comment === 'string' ? comment.trim() : null;

  if (!Number.isSafeInteger(responseId) || responseId < 1) {
    return res.status(400).json({ error: 'Nieprawidłowy identyfikator odpowiedzi.' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Ocena musi być liczbą całkowitą od 1 do 5.' });
  }
  if (comment != null && typeof comment !== 'string') {
    return res.status(400).json({ error: 'Treść opinii musi być tekstem.' });
  }
  if (reviewComment && reviewComment.length > 5000) {
    return res.status(400).json({ error: 'Opinia jest zbyt długa (maksymalnie 5000 znaków).' });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [responses] = await connection.execute(`
      SELECT r.user_id AS targetUserId
      FROM responses r
      JOIN tenders t ON t.id = r.tender_id
      WHERE r.id = ? AND t.user_id = ? AND r.status = 'zaakceptowany'
      FOR UPDATE
    `, [responseId, req.auth.userId]);

    if (!responses.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Nie znaleziono zaakceptowanej współpracy.' });
    }

    const targetUserId = responses[0].targetUserId;
    if (String(targetUserId) === String(req.auth.userId)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Nie można wystawić opinii samemu sobie.' });
    }

    const [existingReviews] = await connection.execute(
      'SELECT id FROM reviews WHERE response_id = ? LIMIT 1 FOR UPDATE',
      [responseId],
    );
    if (existingReviews.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'Opinia do tej współpracy została już dodana.' });
    }

    await connection.execute(
      `INSERT INTO reviews
        (reviewer_id, target_user_id, response_id, rating, comment, is_verified)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      [req.auth.userId, targetUserId, responseId, rating, reviewComment || null],
    );
    await connection.commit();
    return res.status(201).json({ message: 'Dziękujemy za dodanie opinii.' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Błąd dodawania opinii:', error);
    return res.status(500).json({ error: 'Nie udało się dodać opinii.' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/me/availability', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT weekday, start_time AS startTime, end_time AS endTime
       FROM weekly_availability WHERE user_id = ? ORDER BY weekday`,
      [req.auth.userId],
    );
    return res.json(rows);
  } catch (error) {
    console.error('Błąd pobierania dostępności:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać dostępności.' });
  }
});

app.put('/api/me/availability', authenticate, async (req, res) => {
  const { slots } = req.body || {};
  if (!Array.isArray(slots) || slots.length > 7) {
    return res.status(400).json({ error: 'Podaj dostępność od 0 do 7 dni.' });
  }

  const seenDays = new Set();
  for (const slot of slots) {
    if (!slot || !Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7
        || seenDays.has(slot.weekday)
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime)
        || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime)
        || slot.startTime >= slot.endTime) {
      return res.status(400).json({ error: 'Sprawdź dzień oraz godziny dostępności.' });
    }
    seenDays.add(slot.weekday);
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.execute('DELETE FROM weekly_availability WHERE user_id = ?', [req.auth.userId]);
    for (const slot of slots) {
      await connection.execute(
        `INSERT INTO weekly_availability (user_id, weekday, start_time, end_time)
         VALUES (?, ?, ?, ?)`,
        [req.auth.userId, slot.weekday, slot.startTime, slot.endTime],
      );
    }
    await connection.commit();
    return res.json({ message: 'Zapisano dostępność.', slots });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Błąd zapisywania dostępności:', error);
    return res.status(500).json({ error: 'Nie udało się zapisać dostępności.' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/professionals/:id/availability', async (req, res) => {
  const professionalId = Number(req.params.id);
  if (!Number.isSafeInteger(professionalId) || professionalId < 1) {
    return res.status(400).json({ error: 'Nieprawidłowy fachowiec.' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT weekday, start_time AS startTime, end_time AS endTime
       FROM weekly_availability WHERE user_id = ? ORDER BY weekday`,
      [professionalId],
    );
    return res.json(rows);
  } catch (error) {
    console.error('Błąd pobierania terminów fachowca:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać terminów.' });
  }
});

app.get('/api/tenders/:id', async (req, res) => {
  const tenderId = Number(req.params.id);
  if (!Number.isSafeInteger(tenderId) || tenderId < 1) {
    return res.status(400).json({ error: 'Nieprawidłowy identyfikator zlecenia.' });
  }

  try {
    const [updateResult] = await db.execute(
      'UPDATE tenders SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?',
      [tenderId],
    );
    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Nie znaleziono takiego zlecenia.' });
    }

    const [rows] = await db.execute(`
      SELECT t.id, t.title, t.description, t.category, t.status,
             t.budget_min, t.budget_max, t.city, t.created_at, t.expires_at,
             t.views_count, t.responses_count,
             u.first_name AS author_first_name,
             u.last_name AS author_last_name,
             u.experience_years AS author_experience_years,
             review_stats.average_rating AS author_rating,
             COALESCE(review_stats.review_count, 0) AS author_review_count
      FROM tenders t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN (
        SELECT target_user_id, ROUND(AVG(rating), 1) AS average_rating,
               COUNT(rating) AS review_count
        FROM reviews
        GROUP BY target_user_id
      ) AS review_stats ON review_stats.target_user_id = t.user_id
      WHERE t.id = ?
      LIMIT 1
    `, [tenderId]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Nie znaleziono takiego zlecenia.' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Błąd pobierania szczegółów zlecenia:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać zlecenia.' });
  }
});

app.get('/api/tenders', async (req, res) => {
  try {
    const [rows] = await db.query(`
    SELECT t.id, t.title, t.description, t.category, t.status,
           t.budget_min, t.budget_max, t.city, t.created_at, t.expires_at,
           t.views_count, t.responses_count,
           u.experience_years AS author_experience_years,
           review_stats.average_rating AS author_rating,
           COALESCE(review_stats.review_count, 0) AS author_review_count
    FROM tenders t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN (
      SELECT target_user_id, ROUND(AVG(rating), 1) AS average_rating,
             COUNT(rating) AS review_count
      FROM reviews
      GROUP BY target_user_id
    ) AS review_stats ON review_stats.target_user_id = t.user_id
    ORDER BY t.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при чтении заказов' });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API запущен на порту ${port}`));