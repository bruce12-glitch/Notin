import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:password@127.0.0.1:5432/notin',
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
});

/** Lightweight Prisma-like data access helpers used by controllers */
const db = {
  async $connect() {
    const client = await pool.connect();
    client.release();
  },

  async $disconnect() {
    await pool.end();
  },

  async query(text, params) {
    return pool.query(text, params);
  },

  user: {
    async findUnique({ where: { email } }) {
      const { rows } = await pool.query(
        'SELECT id, username, email, password, "createdAt", "updatedAt" FROM "User" WHERE email = $1 LIMIT 1',
        [email]
      );
      return rows[0] || null;
    },

    async create({ data: { username, email, password } }) {
      const { rows } = await pool.query(
        `INSERT INTO "User" (id, username, email, password, "createdAt", "updatedAt")
         VALUES (cuid(), $1, $2, $3, NOW(), NOW())
         RETURNING id, username, email, password, "createdAt", "updatedAt"`,
        [username, email, password]
      );
      return rows[0];
    },
  },

  note: {
    async create({ data: { title, description, userId } }) {
      const { rows } = await pool.query(
        `INSERT INTO "Note" (id, title, description, "userId", "createdAt", "updatedAt")
         VALUES (cuid(), $1, $2, $3, NOW(), NOW())
         RETURNING id, title, description, "userId", "createdAt", "updatedAt"`,
        [title, description, userId]
      );
      return rows[0];
    },

    async findMany({ where: { userId }, orderBy } = {}) {
      const order =
        orderBy?.createdAt === 'desc' ? '"createdAt" DESC' : '"createdAt" ASC';
      const { rows } = await pool.query(
        `SELECT id, title, description, "userId", "createdAt", "updatedAt"
         FROM "Note" WHERE "userId" = $1 ORDER BY ${order}`,
        [userId]
      );
      return rows;
    },

    async findFirst({ where: { id, userId } }) {
      const { rows } = await pool.query(
        `SELECT id, title, description, "userId", "createdAt", "updatedAt"
         FROM "Note" WHERE id = $1 AND "userId" = $2 LIMIT 1`,
        [id, userId]
      );
      return rows[0] || null;
    },

    async update({ where: { id }, data: { title, description } }) {
      const { rows } = await pool.query(
        `UPDATE "Note"
         SET title = $1, description = $2, "updatedAt" = NOW()
         WHERE id = $3
         RETURNING id, title, description, "userId", "createdAt", "updatedAt"`,
        [title, description, id]
      );
      return rows[0];
    },

    async delete({ where: { id } }) {
      await pool.query('DELETE FROM "Note" WHERE id = $1', [id]);
      return { id };
    },
  },
};

export default db;
