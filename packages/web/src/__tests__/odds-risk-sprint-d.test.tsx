import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OddsButton } from '../components/OddsButton';
import { RiskMeter } from '../components/RiskMeter';

describe('OddsButton / RiskMeter sprint D', () => {
  it('keeps a fixed OddsButton footprint', () => {
    const html = renderToStaticMarkup(
      <OddsButton odds={1.85} selection="SPARTA" />,
    );
    expect(html).toContain('h-12');
    expect(html).toContain('w-[110px]');
    expect(html).toContain('1.85');
  });

  it('renders daily risk, correlation, and kelly deviation', () => {
    const html = renderToStaticMarkup(
      <RiskMeter
        stake={200}
        bankroll={10000}
        openExposure={500}
        dailyRisk={700}
        correlationRisk={0.7}
        kellyDeviation={0.03}
      />,
    );
    expect(html).toContain('7.0%'); // daily 700/10000
    expect(html).toContain('70%');
    expect(html).toContain('+3.0pp');
  });
});
