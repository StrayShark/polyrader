import { useState, useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ThemeProvider } from './components/ThemeProvider';
import { ToastProvider } from './components/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SetupPage } from './pages/setup-page';
import { isFirstRun, onTauriEvent } from './utils/tauri-bridge';
import { checkForUpdates } from './utils/update-checker';
import { useI18n } from './hooks/use-i18n';
import { useFeatureFlagStore } from './stores/feature-flag-store';
import { LoadingState } from './components/LoadingState';

export default function App() {
  const [showSetup, setShowSetup] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);
  const [sidecarReady, setSidecarReady] = useState(
    typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)
  );
  const { t } = useI18n();

  useEffect(() => {
    // Check if first run
    isFirstRun().then((firstRun) => {
      setShowSetup(firstRun);
      setSetupChecked(true);
    });

    // Fetch server feature flags once the backend is reachable
    void useFeatureFlagStore.getState().fetchFeatures();

    // Listen for sidecar events
    const unlistenPromises: Promise<() => void>[] = [];

    unlistenPromises.push(onTauriEvent<number>('sidecar-ready', (port) => {
      console.log(`[Tauri] Sidecar ready on port ${port}`);
      setSidecarReady(true);
      // Check for app updates after sidecar is ready
      checkForUpdates();
    }));

    unlistenPromises.push(onTauriEvent<string>('sidecar-error', (err) => {
      console.error(`[Tauri] Sidecar error: ${err}`);
    }));

    unlistenPromises.push(onTauriEvent('sidecar-restarting', () => {
      console.log('[Tauri] Sidecar restarting...');
      setSidecarReady(false);
    }));

    return () => {
      unlistenPromises.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  const handleSetupComplete = () => {
    // Don't set sidecarReady here — the sidecar is started by set_data_dir (Rust),
    // and the sidecar-ready event will fire when it's up.
    setShowSetup(false);
  };

  // Show loading while checking setup state
  if (!setupChecked) {
    return (
      <LoadingState className="min-h-screen bg-background" label={t('app.starting')} />
    );
  }

  // First-run setup
  if (showSetup) {
    return <SetupPage onComplete={handleSetupComplete} />;
  }

  // Waiting for sidecar
  if (!sidecarReady) {
    return (
      <LoadingState className="min-h-screen bg-background" label={t('app.startingBackend')} />
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
