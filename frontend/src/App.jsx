// =====================================================
// App — Main application with routing + page transitions
// =====================================================
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import { useTheme } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Loader from './components/Loader';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import AuthPage from './pages/AuthPage';

const HomePage    = lazy(() => import('./pages/HomePage'));
const FlightBoard = lazy(() => import('./pages/FlightBoard'));
const FlightDetail= lazy(() => import('./pages/FlightDetail'));
const RadarPage   = lazy(() => import('./pages/RadarPage'));
const WeatherPage = lazy(() => import('./pages/WeatherPage'));
const ChatbotPage = lazy(() => import('./pages/ChatbotPage'));
const CrowdPage          = lazy(() => import('./pages/CrowdPage'));
const TravelPlannerPage  = lazy(() => import('./pages/TravelPlannerPage'));
const MobilityAssistPage = lazy(() => import('./pages/MobilityAssistPage'));
const AdminAssistPage         = lazy(() => import('./pages/AdminAssistPage'));
const AdminAnalyticsDashboard = lazy(() => import('./pages/AdminAnalyticsDashboard'));
const Dashboard               = lazy(() => import('./pages/Dashboard'));
const CurrencyPage            = lazy(() => import('./pages/CurrencyPage'));
const FlightComparePage       = lazy(() => import('./pages/FlightComparePage'));

// Wraps each page so one crash can't blank the entire app
function PageBoundary({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

// Smooth fade-in wrapper for page transitions
const pageVariants = {
  initial:  { opacity: 0, y: 6 },
  animate:  { opacity: 1, y: 0 },
  exit:     { opacity: 0, y: -4 },
};

function PageTransition({ children }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const { isDark } = useTheme();
  const location = useLocation();

  const toastStyle = isDark
    ? { background: '#0d1220', color: '#e8f0fe', border: '0.5px solid rgba(99,179,255,0.22)' }
    : { background: '#ffffff', color: '#0f172a', border: '0.5px solid rgba(79,112,214,0.25)' };

  if (loading) return <Loader />;

  // Not logged in — show auth page
  if (!user) {
    return (
      <>
        <Toaster position="top-right" toastOptions={{ style: toastStyle }} />
        <Routes>
          <Route path="*" element={<AuthPage />} />
        </Routes>
      </>
    );
  }

  return (
    <div className="min-h-screen">
      <Toaster position="top-right" toastOptions={{ style: toastStyle }} />
      <ErrorBoundary>
        <Navbar />
      </ErrorBoundary>
      <OfflineBanner />
      <main>
        <Suspense fallback={<Loader />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/"           element={<PageTransition><PageBoundary><HomePage /></PageBoundary></PageTransition>} />
            <Route path="/flights"    element={<PageTransition><PageBoundary><FlightBoard /></PageBoundary></PageTransition>} />
            <Route path="/flights/:flightId" element={<PageTransition><PageBoundary><FlightDetail /></PageBoundary></PageTransition>} />
            <Route path="/radar"      element={<PageTransition><PageBoundary><RadarPage /></PageBoundary></PageTransition>} />
            <Route path="/weather"    element={<PageTransition><PageBoundary><WeatherPage /></PageBoundary></PageTransition>} />
            <Route path="/chatbot"    element={<PageTransition><PageBoundary><ChatbotPage /></PageBoundary></PageTransition>} />
            <Route path="/crowd"      element={<PageTransition><PageBoundary><CrowdPage /></PageBoundary></PageTransition>} />
            <Route path="/travel"     element={<PageTransition><PageBoundary><TravelPlannerPage /></PageBoundary></PageTransition>} />
            <Route path="/assist"       element={<PageTransition><PageBoundary><MobilityAssistPage /></PageBoundary></PageTransition>} />
            <Route path="/admin/assist"     element={<PageTransition><PageBoundary><AdminAssistPage /></PageBoundary></PageTransition>} />
            <Route path="/admin/analytics" element={<PageTransition><PageBoundary><AdminAnalyticsDashboard /></PageBoundary></PageTransition>} />
            <Route path="/dashboard"       element={<PageTransition><PageBoundary><Dashboard /></PageBoundary></PageTransition>} />
            <Route path="/currency"        element={<PageTransition><PageBoundary><CurrencyPage /></PageBoundary></PageTransition>} />
            <Route path="/compare"         element={<PageTransition><PageBoundary><FlightComparePage /></PageBoundary></PageTransition>} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
        </Suspense>
      </main>
    </div>
  );
}
