require('dotenv').config({ path: './backend/.env' });
const pool = require('./backend/config/database');

async function testInsert() {
  try {
    const title = 'Test Task API';
    const description = 'Testing 123';
    const status = 'todo';
    const priority = 'medium';
    const due_date = '2026-03-15';
    const pic = 'Harun';

    console.log('Using DB URL:', process.env.DATABASE_URL ? 'Connected' : 'Missing');
    console.log('Attempting insert with:', { title, description, status, priority, due_date, pic });

    const result = await pool.query(
      'INSERT INTO tasks (title, description, status, priority, due_date, pic) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, description, status, priority, due_date, pic]
    );

    console.log('Success:', result.rows[0]);
  } catch (err) {
    console.error('Database Error:', err.message);
    if (err.code) console.error('Error Code:', err.code);
    if (err.detail) console.error('Error Detail:', err.detail);
  } finally {
    process.exit();
  }
}

testInsert();
