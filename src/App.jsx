import { Suspense, Component } from 'react';
import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config.js'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound.jsx';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from '@/pages/Login';
import PendingApproval from '@/components/auth/PendingApproval';
import ForgotPassword from '@/components/auth/ForgotPassword';
import ResetPassword from '@/components/auth/ResetPassword';
import { ConfirmProvider } from '@/components/shared/ConfirmDialog';
import PageErrorBoundary from '@/components/shared/PageErrorBoundary';
import { buildLoginUrl } from '@/lib/returnUrl';
import { canAccessPage, LEGACY_REDIRECTS, resolveLegacyRedirect } from '@/components/layout/navConfig';
import AccessDenied from '@/components/shared/AccessDenied';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('Application error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900 text-white">
          <div className="text-center max-w-md p-8">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-slate-400 mb-4">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded text-sm"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


const PageLoadingFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center" aria-label="Loading page">
    <div className="w-8 h-8 border-4 border-slate-700 border-t-cyan-400 rounded-full animate-spin"></div>
  </div>
);

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => {
  const { pathname } = useLocation();
  // A crash inside one page shouldn't take down the sidebar; keyed on the path
  // so navigating elsewhere clears it.
  const content = (
    <PageErrorBoundary key={pathname}>
      <Suspense fallback={<PageLoadingFallback />}>{children}</Suspense>
    </PageErrorBoundary>
  );
  return Layout ? <Layout currentPageName={currentPageName}>{content}</Layout> : content;
};

// The session couldn't be checked (server or database briefly down): say so
// and offer a retry instead of sending a signed-in person to the login page.
const SessionUnavailable = ({ message, onRetry }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-slate-900 p-4">
    <div role="alert" className="max-w-sm rounded-lg border border-amber-500/30 bg-amber-900/30 p-6 text-center">
      <p className="font-semibold text-amber-400">Can&apos;t reach CareMetric AI right now</p>
      <p className="mt-2 text-sm text-slate-300">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
      >
        Try again
      </button>
    </div>
  </div>
);

const ProtectedRoute = ({ children, pageName }) => {
  const { isAuthenticated, isLoadingAuth, sessionExpired, user, authError, checkAppState } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated && authError?.type === 'unavailable') {
    return <SessionUnavailable message={authError.message} onRetry={checkAppState} />;
  }

  if (!isAuthenticated) {
    return <Navigate to={buildLoginUrl(location, { reason: sessionExpired ? 'expired' : undefined })} replace />;
  }

  // Signed in, but an admin hasn't approved the account yet.
  if (user?.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  if (pageName && !canAccessPage(pageName, user?.role)) {
    return <DeniedPage pageName={pageName} />;
  }

  return children;
};

// Admin-only pages are hidden from non-admin nav, but a bookmarked or shared
// URL still lands here: keep the app chrome and explain instead of rendering a
// page whose data calls would all fail with 403.
const DeniedPage = ({ pageName }) => (
  <LayoutWrapper currentPageName={pageName}>
    <AccessDenied />
  </LayoutWrapper>
);

// Old page URLs (merged or renamed pages) forward to where the page lives now,
// keeping the query string and hash so bookmarks and shared links still work.
const LegacyRedirect = ({ page }) => {
  const { search, hash } = useLocation();
  return <Navigate to={`${resolveLegacyRedirect(page, search)}${hash}`} replace />;
};

const AuthenticatedApp = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pending" element={<PendingApproval />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={
        <ProtectedRoute pageName={mainPageKey}>
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        </ProtectedRoute>
      } />
      {Object.keys(LEGACY_REDIRECTS).map((page) => (
        <Route key={`legacy-${page}`} path={`/${page}`} element={<LegacyRedirect page={page} />} />
      ))}
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <ProtectedRoute pageName={path}>
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            </ProtectedRoute>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <ConfirmProvider>
            <Router>
              <NavigationTracker />
              <AuthenticatedApp />
            </Router>
          </ConfirmProvider>
          <Toaster richColors closeButton position="top-right" />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
