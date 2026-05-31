const { Client } = require('pg');

const connectionString = 'postgresql://postgres.nlylbnsagdrcigbdrbmw:Toritori33%23%23@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres';

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  try {
    console.log('Connecting to Supabase PostgreSQL database...');
    await client.connect();
    console.log('Connected successfully!');

    console.log('Creating tables if they do not exist...');

    // 1. Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL
      );
    `);
    console.log('- "users" table created/verified.');

    // 2. Create learning_records table
    await client.query(`
      CREATE TABLE IF NOT EXISTS learning_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_name TEXT NOT NULL,
        grade INT NOT NULL,
        semester INT NOT NULL,
        month INT NOT NULL,
        area TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        question_text TEXT NOT NULL,
        correct_answer TEXT NOT NULL,
        user_answer TEXT NOT NULL,
        is_correct BOOLEAN NOT NULL,
        time_spent_ms INT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL
      );
    `);
    console.log('- "learning_records" table created/verified.');

    // 3. Disable RLS for ease of client-side integration in this client-managed app
    await client.query('ALTER TABLE users DISABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE learning_records DISABLE ROW LEVEL SECURITY;');
    console.log('- Row Level Security (RLS) disabled for "users" and "learning_records" to ensure smooth client-side operations.');

    // 4. Pre-seed users
    console.log('Pre-seeding default learners...');
    await client.query(`
      INSERT INTO users (name)
      VALUES ('학습자 1'), ('학습자 2')
      ON CONFLICT (name) DO NOTHING;
    `);
    console.log('- seeded "학습자 1" and "학습자 2" (if not already present).');

    console.log('Database initialization completed successfully!');
  } catch (err) {
    console.error('Error during database initialization:', err);
  } finally {
    await client.end();
    console.log('Connection closed.');
  }
}

main();
