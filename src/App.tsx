import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/src/context/AuthContext';
import { ShopProvider } from '@/src/context/ShopContext';
import { Navbar } from '@/src/components/Navbar';
import { Footer } from '@/src/components/Footer';
import { HomePage } from '@/src/pages/HomePage';
import { SearchAndCategoryPage } from '@/src/pages/SearchAndCategoryPage';
import { ProductDetailPage } from '@/src/pages/ProductDetailPage';
import { ForgotPasswordPage, LoginPage, RegisterPage } from '@/src/pages/AuthPages';
import { AccountPage, WishlistPage } from '@/src/pages/AccountAndWishlistPages';
import { CartPage, CheckoutPage, PaymentResultPage } from '@/src/pages/CartAndCheckoutPages';
import { OrdersPage, OrderTrackingPage } from '@/src/pages/OrdersAndTrackingPages';
import { AssistantPage } from '@/src/pages/AssistantPage';
import { AdminPage } from '@/src/pages/AdminPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ShopProvider>
          <BrowserRouter>
            <div className="flex min-h-screen flex-col bg-white text-slate-900">
              <Navbar />
              <main className="flex-1">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/category/:slug" element={<SearchAndCategoryPage />} />
                  <Route path="/search" element={<SearchAndCategoryPage />} />
                  <Route path="/product/:slug" element={<ProductDetailPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="/wishlist" element={<WishlistPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/checkout" element={<CheckoutPage />} />
                  <Route path="/payment-result" element={<PaymentResultPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/orders/:orderNumber" element={<OrderTrackingPage />} />
                  <Route path="/track/:trackingToken" element={<OrderTrackingPage />} />
                  <Route path="/assistant" element={<AssistantPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                </Routes>
              </main>
              <Footer />
            </div>
            <Toaster position="bottom-right" richColors />
          </BrowserRouter>
        </ShopProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
