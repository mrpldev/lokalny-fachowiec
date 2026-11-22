import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import {
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

    return res.json({
      message: 'Zalogowano pomyślnie.',
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