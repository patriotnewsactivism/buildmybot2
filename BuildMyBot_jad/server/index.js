const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('node:path');

const app = express();
const db = new Database(path.join(__dirname, '../data/local_bot_builder.db'));

app.use(cors());
app.use(express.json());

// Initialize Database Tables (Schema)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT
  );
  CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    config JSON,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Basic Route to save a Bot configuration
app.post('/api/save-bot', (req, res) => {
  const { userId, name, config } = req.body;
  const stmt = db.prepare(
    'INSERT INTO bots (user_id, name, config) VALUES (?, ?, ?)',
  );
  const info = stmt.run(userId, name, JSON.stringify(config));
  res.json({ success: true, id: info.lastInsertRowid });
});

app.listen(3001, () =>
  console.log('BuildMyBot Local Server running on port 3001'),
);
