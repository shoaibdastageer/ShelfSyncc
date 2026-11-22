import dotenv from 'dotenv';
dotenv.config();
import {
  bulkIndexProductsOpenSearch,
  ensureOpenSearchIndex,
  pingOpenSearch,
} from '../backend/src/opensearch/opensearchService';
import { repo } from '../backend/src/db/repository';

async function main() {
  const ping = await pingOpenSearch();
  if (ping.status !== 'connected') {
    console.error('OpenSearch setup skipped:', ping.message);
    process.exit(1);
  }
  await ensureOpenSearchIndex();
  const products = await repo.listProducts(false);
  const count = await bulkIndexProductsOpenSearch(products);
  console.log(`Created/verified index "shelfsync_products" and indexed ${count} products.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('OpenSearch setup failed:', err);
  process.exit(1);
});
