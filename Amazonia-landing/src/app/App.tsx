import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/auth';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { AdBanner } from './components/AdBanner';
import { LatestEditions } from './components/LatestEditions';
import { LatestNews } from './components/LatestNews';
import { DigitalSection } from './components/DigitalSection';
import { PricingSection } from './components/PricingSection';
import { CTASection } from './components/CTASection';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { VerifyEmailPage } from './components/VerifyEmailPage';
import NoticiasPage from './components/NoticiasPage';
import DashboardLayout from './components/dashboard/DashboardLayout';
import DashboardOverview from './components/dashboard/DashboardOverview';
import Editions from './components/dashboard/Editions';
import Viewer from './components/dashboard/Viewer';
import Users from './components/dashboard/Users';
import Subscribers from './components/dashboard/Subscribers';
import Purchases from './components/dashboard/Purchases';
import Plans from './components/dashboard/Plans';
import PaymentMethodsAdmin from './components/dashboard/PaymentMethodsAdmin';
import LandingConfig from './components/dashboard/LandingConfig';
import LandingEditions from './components/dashboard/LandingEditions';
import LandingNews from './components/dashboard/LandingNews';
import PaymentPage from './components/PaymentPage';
import { ReceiptViewPage } from './components/dashboard/ReceiptViewPage';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b1f13] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
        <span className="text-white text-xs font-bold uppercase tracking-widest animate-pulse">Cargando Amazonia...</span>
      </div>
    );
  }

  // Layout principal de la Landing Page
  const LandingPage = (
    <div className="min-h-screen bg-white">
      <Header />
      <HeroSection />
      
      {/* Primer Banner de Publicidad (Rotativo) */}
      <AdBanner positionId="top-banner" initialIndex={0} />

      <section className="bg-gray-50 py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2">
              <LatestEditions />
              <DigitalSection />
            </div>
            <div className="lg:col-span-1">
              <LatestNews />
            </div>
          </div>
        </div>
      </section>

      {/* Segundo Banner de Publicidad (Patrocinado Rotativo) */}
      <AdBanner positionId="middle-banner" initialIndex={1} />

      <PricingSection />
      <CTASection />
      <Footer />
      
      {/* Componentes Globales de Autenticación */}
      <AuthModal />
    </div>
  );

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          isAuthenticated && user?.email === 'admin'
            ? <Navigate to="/dashboard" replace />
            : LandingPage
        } 
      />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/payment" element={<PaymentPage />} />
      <Route path="/noticias" element={<NoticiasPage />} />
      
      {/* Rutas Protegidas del Dashboard */}
      <Route 
        path="/dashboard" 
        element={
          isAuthenticated 
            ? <DashboardLayout /> 
            : <Navigate to="/" replace />
        }
      >
        <Route index element={<DashboardOverview />} />
        <Route path="editions" element={<Editions />} />
        <Route path="viewer" element={<Viewer />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="users" element={<Users />} />
        <Route path="subscribers" element={<Subscribers />} />
        <Route path="plans" element={<Plans />} />
        <Route path="payments-methods" element={<PaymentMethodsAdmin />} />
        <Route path="landing-config" element={<LandingConfig />} />
        <Route path="landing-editions" element={<LandingEditions />} />
        <Route path="landing-news" element={<LandingNews />} />
        <Route path="settings" element={<div className="p-8 bg-white border border-slate-200 rounded-3xl text-left font-extrabold text-slate-800 text-sm">Configuración</div>} />
        <Route path="receipt" element={<ReceiptViewPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { PWAProvider } from './contexts/PWAContext';

export default function App() {
  return (
    <AuthProvider>
      <PWAProvider>
        <Router>
          <AppContent />
          <Toaster position="top-right" richColors />
        </Router>
      </PWAProvider>
    </AuthProvider>
  );
}
