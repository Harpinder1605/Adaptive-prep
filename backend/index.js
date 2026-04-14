const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { exec } = require('child_process');
const path = require('path');
const bcrypt = require('bcrypt'); 
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect((err) => {
  if (err) console.error('Database connection error:', err.stack);
  else console.log('Successfully connected to Neon PostgreSQL database!');
});

app.get('/api/health', (req, res) => res.json({ message: 'Backend is up!' }));

// Users: Login Route
app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Parameterized queries ($1) automatically protect against SQL Injection!
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User does not exist!' });
    }
    
    const user = existingUser.rows[0];
    
    // Legacy support for older plain-text passwords
    if (!user.password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await pool.query('UPDATE users SET password = $1 WHERE username = $2', [hashedPassword, username]);
      return res.json(user);
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Incorrect password!' });
    
    return res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Users: Signup Route
app.post('/api/users/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken!' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username', // Don't return the password hash back to the frontend
      [username, hashedPassword]
    );
    res.json(newUser.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Topics (User Specific)
app.post('/api/topics', async (req, res) => {
  try {
    const { name, userId } = req.body;
    
    // Auto-patch: Upgrade database table to track which user made the topic
    await pool.query('ALTER TABLE topics ADD COLUMN IF NOT EXISTS user_id INTEGER;');

    const newTopic = await pool.query(
      'INSERT INTO topics (name, difficulty_weight, user_id) VALUES ($1, 1, $2) RETURNING *',
      [name, userId]
    );
    res.json(newTopic.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/api/topics', async (req, res) => {
  try {
    const { userId } = req.query;
    
    // Auto-patch just in case GET is called first
    await pool.query('ALTER TABLE topics ADD COLUMN IF NOT EXISTS user_id INTEGER;');

    let query = 'SELECT * FROM topics';
    let params = [];

    // Fetch topics created by this specific user OR older global topics
    if (userId) {
      query += ' WHERE user_id = $1 OR user_id IS NULL';
      params.push(userId);
    }
    query += ' ORDER BY id DESC';

    const allTopics = await pool.query(query, params);
    res.json(allTopics.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Delete Topic
app.delete('/api/topics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Safely cascade delete in order: Attempts -> Questions -> Topic
    await pool.query('DELETE FROM attempt_history WHERE question_id IN (SELECT id FROM questions WHERE topic_id = $1)', [id]);
    await pool.query('DELETE FROM questions WHERE topic_id = $1', [id]);
    await pool.query('DELETE FROM topics WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Topic deleted successfully' });
  } catch (err) {
    console.error(err);
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

// Generate initial questions for a custom topic (Smart Fallback)
app.post('/api/generate-initial', async (req, res) => {
  const { topic, userId, topicId } = req.body;
  let difficulty = 1;

  try {
    if (userId && topicId) {
      // Find the highest difficulty this specific user reached for this topic
      const diffQuery = await pool.query(`
        SELECT MAX(q.difficulty_level) as max_diff
        FROM attempt_history a
        JOIN questions q ON a.question_id = q.id
        WHERE a.user_id = $1 AND q.topic_id = $2
      `, [userId, topicId]);

      if (diffQuery.rows[0].max_diff) {
        difficulty = diffQuery.rows[0].max_diff; // Resume from their max level!
      }
    }
  } catch (err) {
    console.error("Error fetching max difficulty:", err);
  }

  const mlEnginePath = path.join(__dirname, '../ml_engine');
  
  exec(`python generate_questions.py "${topic}" ${difficulty}`, { cwd: mlEnginePath }, (error, stdout, stderr) => {
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