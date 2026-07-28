import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock WebSocket-dependent hooks before importing components that use them
vi.mock('../hooks/use-websocket', () => ({
  useWebSocket: () => ({
    connectionState: 'connected',
    wsStatus: 'connected' as const,
    latency: 10,
    lastEvent: null,
    subscribe: () => () => {},
    send: () => {},
  }),
}));

vi.mock('../hooks/use-whale-alerts', () => ({
  useWhaleAlerts: () => {},
}));

vi.mock('../hooks/use-settlement-alerts', () => ({
  useSettlementAlerts: () => {},
}));

vi.mock('../hooks/use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: () => {},
}));

// Mock Tauri bridge to return browser-mode values
vi.mock('../utils/tauri-bridge', () => ({
  isTauriEnvironment: () => false,
  isFirstRun: () => Promise.resolve(false),
  getSidecarPort: () => Promise.resolve(0),
  getApiBase: () => Promise.resolve('/api'),
  getWsUrl: () => Promise.resolve('ws://localhost:3001/ws'),
  getConfig: () => Promise.resolve({}),
  onTauriEvent: () => Promise.resolve(() => {}),
}));

// Mock TickerBar (uses WebSocket + API)
vi.mock('../components/TickerBar', () => ({
  TickerBar: () => <div data-testid="ticker-bar" />,
}));

import { AppLayout } from '../layouts/app-layout';
import { Sidebar } from '../layouts/sidebar';
import { ThemeProvider } from '../components/ThemeProvider';

// Helper: render AppLayout with all required providers
function renderAppLayout(initialPath = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="*" element={<AppLayout />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// ============================================================
// Layout: No Duplicate Sidebars
// ============================================================
describe('Layout: Sidebar uniqueness', () => {
  beforeEach(() => {
    // Reset theme
    document.documentElement.className = '';
  });

  it('renders only the navigation sidebar on the event lobby', () => {
    const { container } = renderAppLayout('/');
    const sidebars = container.querySelectorAll('aside');
    expect(sidebars.length).toBe(1);
  });

  it('desktop sidebar wrapper has lg:block class', () => {
    const { container } = renderAppLayout('/');
    const desktopWrapper = container.querySelector('.hidden.lg\\:block');
    expect(desktopWrapper).toBeTruthy();
  });

  it('does not render mobile sidebar overlay when closed', () => {
    const { container } = renderAppLayout('/');
    // No overlay div should be present (overlay only shows when sidebar is open)
    const overlay = container.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeNull();
  });

  it('only renders the bet slip on match routes', () => {
    const { queryByTestId } = renderAppLayout('/analysis/report');
    expect(queryByTestId('desktop-bet-slip')).toBeNull();
  });

  it('does not render the global bankroll summary bar', () => {
    const { queryByTestId } = renderAppLayout('/');
    expect(queryByTestId('virtual-bankroll-bar')).toBeNull();
  });
});

describe('Layout: Top bar', () => {
  it('does not render a global topbar', () => {
    const { queryByTestId } = renderAppLayout('/');
    expect(queryByTestId('app-topbar')).toBeNull();
  });

  it('renders a window top border without restoring the topbar', () => {
    const { getByTestId } = renderAppLayout('/');
    const border = getByTestId('window-top-border');
    expect(border.className).toContain('top-0');
    expect(border.className).toContain('h-px');
    expect(border.className).toContain('bg-border');
  });

  it('keeps the mobile menu entry available without a topbar', () => {
    const { getByLabelText } = renderAppLayout('/');
    expect(getByLabelText('Toggle menu')).toBeTruthy();
  });

  it('does not repeat the product mode in the global shell', () => {
    const { queryByText } = renderAppLayout('/');
    expect(queryByText('Practice Mode')).toBeNull();
    expect(queryByText('练习账户')).toBeNull();
    expect(queryByText('SQLite 已同步')).toBeNull();
  });

  it('does not render a global search box', () => {
    const { queryByRole } = renderAppLayout('/');
    expect(queryByRole('button', { name: /全局搜索|Global search/i })).toBeNull();
  });
});

// ============================================================
// Layout: Sidebar Content
// ============================================================
describe('Layout: Sidebar content', () => {
  it('renders four primary modules with one bottom settings entry', () => {
    const { container } = renderAppLayout('/');
    const links = container.querySelectorAll('aside nav a');
    expect(links.length).toBe(5);
    const linkTexts = Array.from(links).map((link) => link.textContent?.trim());
    expect(linkTexts).toEqual(['总览', '模拟盘', '巨鲸追踪', '日历', '设置']);
    expect(
      Array.from(links).filter((link) => link.getAttribute('href')?.includes('/settings')).length,
    ).toBe(1);
    expect(
      Array.from(links).filter((link) => link.getAttribute('href')?.includes('/bankroll')).length,
    ).toBe(1);
    expect(
      Array.from(links).some((link) => link.getAttribute('href')?.includes('/analysis/report')),
    ).toBe(false);
    expect(
      Array.from(links).some((link) => link.getAttribute('href')?.includes('/validation-lab')),
    ).toBe(false);
    expect(Array.from(links).some((link) => link.getAttribute('href')?.includes('/review'))).toBe(
      false,
    );
    expect(
      Array.from(links).some((link) => link.getAttribute('href')?.includes('/simulation')),
    ).toBe(false);
  });

  it('keeps appearance controls out of the sidebar', () => {
    const { container } = renderAppLayout('/');
    const buttons = container.querySelectorAll('aside button[title]');
    const titles = Array.from(buttons).map((b) => b.getAttribute('title'));
    expect(titles).not.toContain('Dark+');
    expect(titles).not.toContain('Light+');
    expect(titles).not.toContain('Matrix');
  });
});

// ============================================================
// Layout: Sidebar component (isolated)
// ============================================================
describe('Sidebar component', () => {
  it('renders a single <aside> element', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const sidebars = container.querySelectorAll('aside');
    expect(sidebars.length).toBe(1);
  });

  it('does not render overlay without a mobile toggle', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const overlay = container.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeNull();
  });

  it('renders overlay when not collapsed and has onToggle', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar onToggle={() => {}} />
      </MemoryRouter>,
    );
    const overlay = container.querySelector('.fixed.inset-0.z-40');
    expect(overlay).toBeTruthy();
  });

  it('renders one decorative icon for each navigation entry', () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );
    const links = container.querySelectorAll('nav a');
    expect(links).toHaveLength(5);
    expect(container.querySelectorAll('nav svg[aria-hidden="true"]')).toHaveLength(5);
    expect(Array.from(links).every((link) => Boolean(link.textContent?.trim()))).toBe(true);
  });
});

// ============================================================
// CSS Import Verification
// ============================================================
describe('CSS Import Verification', () => {
  it('main.tsx imports themes.css', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mainTsxPath = path.resolve(__dirname, '../main.tsx');
    const content = fs.readFileSync(mainTsxPath, 'utf-8');
    expect(content).toContain("import './styles/themes.css'");
  });

  it('themes.css contains Tailwind directives', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '../styles/themes.css');
    const content = fs.readFileSync(cssPath, 'utf-8');
    expect(content).toContain('@tailwind base');
    expect(content).toContain('@tailwind components');
    expect(content).toContain('@tailwind utilities');
  });

  it('themes.css defines all 3 theme variants', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '../styles/themes.css');
    const content = fs.readFileSync(cssPath, 'utf-8');
    expect(content).toContain('.theme-dark');
    expect(content).toContain('.theme-light');
    expect(content).toContain('.theme-matrix');
  });

  it('themes.css defines --blue variable for all themes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '../styles/themes.css');
    const content = fs.readFileSync(cssPath, 'utf-8');
    const blueMatches = content.match(/--blue:/g);
    expect(blueMatches).toBeTruthy();
    expect(blueMatches!.length).toBe(3); // dark, light, matrix
  });
});

// ============================================================
// API Module: header merge + empty response
// ============================================================
describe('API: request() correctness', () => {
  it('api module exports get, post, put, getBase', async () => {
    const mod = await import('../utils/api');
    expect(mod.api.get).toBeDefined();
    expect(mod.api.post).toBeDefined();
    expect(mod.api.put).toBeDefined();
    expect(mod.getBase).toBeDefined();
  });
});
