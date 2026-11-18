import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? {} : undefined,
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