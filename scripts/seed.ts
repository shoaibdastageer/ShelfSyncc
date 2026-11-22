import dotenv from 'dotenv';
dotenv.config();
import { runPgMigrations, seedPgDatabase, pingPostgres } from '../backend/src/db/pgClient';

async function main() {
  const ping = await pingPostgres();
  if (ping.status !== 'connected') {
    console.error('Cannot seed database:', ping.message);
    process.exit(1);
  }
  await runPgMigrations();
  const res = await seedPgDatabase();
  console.log(`ShelfSync seeded ${res.seededProducts} products, 6 categories, 4 warehouses, and demo accounts.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
