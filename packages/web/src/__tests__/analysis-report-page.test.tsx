import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalysisReportPage } from '../pages/analysis-report-page';

describe('AnalysisReportPage', () => {
  it('renders the CS2 fixture with four report tabs', () => {
    render(
      <MemoryRouter>
        <AnalysisReportPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('analysis-report-page')).toBeTruthy();
    expect(screen.getByTestId('analysis-report-shell')).toBeTruthy();
    expect(screen.getByText(/Natus Vincere vs FaZe Clan/i)).toBeTruthy();
    expect(screen.getByTestId('analysis-tab-report')).toBeTruthy();
    expect(screen.getByTestId('analysis-tab-prompt')).toBeTruthy();
    expect(screen.getByTestId('analysis-tab-response')).toBeTruthy();
    expect(screen.getByTestId('analysis-tab-timeline')).toBeTruthy();

    fireEvent.click(screen.getByTestId('analysis-tab-prompt'));
    expect(screen.getByTestId('analysis-pane-prompt')).toBeTruthy();
    expect(screen.getByText(/analysis\.v1/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('analysis-tab-timeline'));
    expect(screen.getByTestId('analysis-pane-timeline')).toBeTruthy();
    expect(screen.getByText(/Prompt artifact frozen/i)).toBeTruthy();
    expect(screen.getByTestId('analysis-linked-bet')).toBeTruthy();
    expect(screen.getByText(/sbet-fixture-navi/i)).toBeTruthy();
    expect(screen.getByText(/打开复盘|Open review/i)).toBeTruthy();
  });
});
