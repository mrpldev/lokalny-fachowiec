import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
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

app.post('/api/register', async (req, res) => {
  const {
    email,
    phone,
    password,
    firstName,
    lastName,
    role,
    city,
    description,
  } = req.body || {};

  const values = { email, phone, password, firstName, lastName, role, city, description };
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
  if ((normalizedCity && normalizedCity.length > 100)
      || (normalizedDescription && Buffer.byteLength(normalizedDescription, 'utf8') > 65535)) {
    return res.status(400).json({ error: 'Miasto lub opis są zbyt długie.' });
  }

  try {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = await scrypt(password, salt, 64);
    const passwordHash = `scrypt$${salt}$${derivedKey.toString('hex')}`;
    const [result] = await db.execute(
      `INSERT INTO users
        (email, phone, password_hash, first_name, last_name, role, city, registered_at, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ?)`,
      [
        normalizedEmail,
        normalizedPhone,
        passwordHash,
        normalizedFirstName,
        normalizedLastName,
        normalizedRole,
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

app.get('/api/tenders', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, title, description, category, status, budget_min, budget_max,
             city, created_at, expires_at, views_count, responses_count
      FROM tenders
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при чтении заказов' });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API запущен на порту ${port}`));