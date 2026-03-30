const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { exec } = require('child_process');
const path = require('path');
require('dotenv').config();

const app = express();

// 1. Middleware
app.use(cors());
app.use(express.json());

// 2. Database Connection (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect((err) => {
  if (err) console.error('Database connection error:', err.stack);
  else console.log('Successfully connected to Neon PostgreSQL database!');
});

app.get('/api/health', (req, res) => res.json({ message: 'Backend is up!' }));

// Users (With password check)
app.post('/api/users', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      if (!user.password) {
        await pool.query('UPDATE users SET password = $1 WHERE username = $2', [password, username]);
        return res.json(user);
      }
      if (user.password !== password) return res.status(401).json({ error: 'Incorrect password!' });
      return res.json(user);
    }

    const newUser = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
      [username, password]
    );
    res.json(newUser.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Topics
app.post('/api/topics', async (req, res) => {
  try {
    const { name } = req.body;
    const newTopic = await pool.query(
      'INSERT INTO topics (name, difficulty_weight) VALUES ($1, 1) RETURNING *',
      [name]
    );
    res.json(newTopic.rows[0]);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

app.get('/api/topics', async (req, res) => {
  try {
    const allTopics = await pool.query('SELECT * FROM topics ORDER BY id DESC');
    res.json(allTopics.rows);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Questions (Filtered by unanswered)
app.get('/api/questions/:topic_id', async (req, res) => {
  try {
    const { topic_id } = req.params;
    const { userId } = req.query;

    let query = 'SELECT * FROM questions WHERE topic_id = $1';
    let params = [topic_id];

    if (userId) {
      query += ' AND id NOT IN (SELECT question_id FROM attempt_history WHERE user_id = $2)';
      params.push(userId);
    }
    query += ' ORDER BY id ASC LIMIT 3';

    const questions = await pool.query(query, params);
    res.json(questions.rows);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Attempts
app.post('/api/attempts', async (req, res) => {
  try {
    const { user_id, question_id, is_correct, time_taken_seconds } = req.body;
    const newAttempt = await pool.query(
      'INSERT INTO attempt_history (user_id, question_id, is_correct, time_taken_seconds) VALUES ($1, $2, $3, $4) RETURNING *',
      [user_id, question_id, is_correct, time_taken_seconds]
    );
    res.json(newAttempt.rows[0]);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Generate initial questions for a custom topic
app.post('/api/generate-initial', (req, res) => {
  const { topic } = req.body;
  const mlEnginePath = path.join(__dirname, '../ml_engine');
  
  exec(`python generate_questions.py "${topic}"`, { cwd: mlEnginePath }, (error, stdout, stderr) => {
    if (error) {
      console.error("Python Error:", stderr);
      return res.status(500).json({ error: 'Failed to generate initial questions' });
    }
    res.json({ success: true });
  });
});

// Analyze Adaptive Loop
app.post('/api/analyze', (req, res) => {
  const { username } = req.body;
  const mlEnginePath = path.join(__dirname, '../ml_engine');
  
  exec(`python adaptive_analyzer.py "${username}"`, { cwd: mlEnginePath }, (error, stdout, stderr) => {
    if (error) {
      console.error("Python Error:", stderr);
      return res.status(500).json({ error: 'AI analysis failed' });
    }
    try {
      const startTag = '___JSON_START___';
      const endTag = '___JSON_END___';
      if (stdout.includes(startTag) && stdout.includes(endTag)) {
        const jsonStr = stdout.substring(stdout.indexOf(startTag) + 16, stdout.indexOf(endTag)).trim();
        res.json(JSON.parse(jsonStr));
      } else {
        console.error("Raw stdout:", stdout);
        res.status(500).json({ error: 'Could not parse AI output' });
      }
    } catch (e) {
      res.status(500).json({ error: 'Parsing error' });
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server is listening on port ${PORT}`));