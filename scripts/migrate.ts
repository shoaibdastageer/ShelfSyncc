import dotenv from 'dotenv';
dotenv.config();
import { runPgMigrations, pingPostgres } from '../backend/src/db/pgClient';

async function main() {
  const ping = await pingPostgres();
  if (ping.status !== 'connected') {
    console.error('Cannot run migrations:', ping.message);
    process.exit(1);
  }
  await runPgMigrations();
  console.log('ShelfSync PostgreSQL migrations applied successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
