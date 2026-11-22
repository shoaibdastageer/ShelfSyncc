import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 text-slate-600">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link to="/" className="font-display text-xl font-bold text-slate-900">
              Shelf<span className="text-blue-600">Sync</span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Modern Indian e-commerce engineered with real-time stock synchronization, intelligent discovery, and verified INR payments.
            </p>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">Categories</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/category/electronics" className="hover:text-blue-600">Electronics</Link></li>
              <li><Link to="/category/fashion" className="hover:text-blue-600">Fashion</Link></li>
              <li><Link to="/category/home-kitchen" className="hover:text-blue-600">Home &amp; Kitchen</Link></li>
              <li><Link to="/category/grocery" className="hover:text-blue-600">Grocery</Link></li>
              <li><Link to="/category/beauty-personal-care" className="hover:text-blue-600">Beauty &amp; Personal Care</Link></li>
              <li><Link to="/category/sports-fitness" className="hover:text-blue-600">Sports &amp; Fitness</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">Customer Care</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/orders" className="hover:text-blue-600">My Orders &amp; Tracking</Link></li>
              <li><Link to="/account" className="hover:text-blue-600">Profile &amp; Saved Addresses</Link></li>
              <li><Link to="/wishlist" className="hover:text-blue-600">Saved Wishlist</Link></li>
              <li><Link to="/assistant" className="hover:text-blue-600">WhatsApp AI Discovery</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">Store Operations</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/search" className="hover:text-blue-600">Search Full Catalogue</Link></li>
              <li><Link to="/admin" className="hover:text-blue-600">Admin Console</Link></li>
              <li><span className="text-slate-500">Free delivery on orders ₹999+</span></li>
              <li><span className="text-slate-500">UPI, Cards, NetBanking &amp; COD</span></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} ShelfSync India. All rights reserved.</p>
          <p>Fulfillment across Bengaluru · Mumbai · Gurugram · Hyderabad</p>
        </div>
      </div>
    </footer>
  );
}
