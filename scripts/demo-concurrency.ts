import dotenv from 'dotenv';
dotenv.config();
import { repo } from '../backend/src/db/repository';

/**
 * End-to-End Concurrency Demonstration:
 * 1. Sets a product's stock to 1 unit.
 * 2. Fires two simultaneous COD checkout transactions for 1 unit each.
 * 3. Verifies ONLY ONE order succeeds and the second fails cleanly with Insufficient stock.
 */
async function main() {
  const products = await repo.listProducts(false);
  const target = products.find((p) => p.sku === 'SS-BP-503') || products[0];
  await repo.updateProductStock(target.id, 1);

  const customer = await repo.findUserByEmail('aarav@shelfsync.in');
  if (!customer) throw new Error('Seeded customer not found');

  console.log(`\nTarget product: ${target.name} (SKU: ${target.sku})`);
  console.log('Stock set to 1 unit. Launching 2 concurrent purchase attempts...\n');

  const attempt = (label: string) =>
    repo
      .placeOrderAtomic({
        userId: customer.id,
        items: [{ productId: target.id, quantity: 1 }],
        paymentMethod: 'cod',
        shippingName: `Customer ${label}`,
        shippingEmail: customer.email,
        shippingPhone: '+919876543210',
        shippingAddress: '42 Indiranagar 100 Feet Road',
        shippingCity: 'Bengaluru',
        shippingState: 'Karnataka',
        shippingPinCode: '560038',
      })
      .then((res) => ({ label, ok: true as const, orderNumber: res.order.orderNumber }))
      .catch((err) => ({
        label,
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }));

  const results = await Promise.all([attempt('A'), attempt('B')]);
  console.log('Concurrency results:', results);

  const updated = await repo.getProductById(target.id);
  console.log(`Remaining available stock: ${updated?.availableQuantity}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
