import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../components/ThemeProvider';

const PAGE_KEYS: Record<string, string> = {
  '1': '/',
  '2': '/daily',
  '3': '/whales',
  '4': '/esports',
  '5': '/signals',
  '6': '/ai/config',
  '7': '/ai/stats',
};

interface ShortcutOptions {
  /** Toggle the global command palette (Cmd/Ctrl+K). */
  onCommandPalette?: () => void;
}

export function useKeyboardShortcuts({ onCommandPalette }: ShortcutOptions = {}) {
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      const key = e.key.toLowerCase();

      // Cmd/Ctrl + K = open command palette (global search)
      if (key === 'k') {
        e.preventDefault();
        onCommandPalette?.();
        return;
      }

      // Cmd/Ctrl + Shift + N = cycle theme (dark → light → matrix)
      if (e.shiftKey && key === 'n') {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // Cmd/Ctrl + R = refresh data (reload reflects fresh fetches; let browser handle)
      // We intentionally do not preventDefault so the webview reloads.

      // Cmd/Ctrl + number = navigate to page
      if (PAGE_KEYS[e.key]) {
        e.preventDefault();
        navigate(PAGE_KEYS[e.key]);
        return;
      }

      // Cmd/Ctrl + , = settings
      if (e.key === ',') {
        e.preventDefault();
        navigate('/settings');
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, toggleTheme, onCommandPalette]);
}
