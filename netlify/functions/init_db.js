const { Client } = require('pg');

exports.handler = async function(event, context) {
  console.log('Initiating database setup from Netlify serverless function...');
  
  const client = new Client({
    connectionString: 'postgresql://postgres:Toritori33%23%23@db.nlylbnsagdrcigbdrbmw.supabase.co:5432/postgres',
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database successfully.');

    // 1. Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now() NOT NULL
      );
    `);
    console.log('Created users table.');

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
    console.log('Created learning_records table.');

    // 3. Disable RLS for easy REST integration
    await client.query('ALTER TABLE users DISABLE ROW LEVEL SECURITY;');
    await client.query('ALTER TABLE learning_records DISABLE ROW LEVEL SECURITY;');
    console.log('Disabled RLS.');

    // 4. Pre-seed users
    await client.query(`
      INSERT INTO users (name)
      VALUES ('학습자 1'), ('학습자 2')
      ON CONFLICT (name) DO NOTHING;
    `);
    console.log('Seeded users.');

    await client.end();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'success',
        message: 'Supabase database tables created and seeded successfully via Netlify serverless function!'
      })
    };
  } catch (err) {
    console.error('Database initialization error:', err);
    
    try {
      await client.end();
    } catch (e) {}

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        status: 'error',
        message: 'Database initialization failed: ' + err.message
      })
    };
  }
};
