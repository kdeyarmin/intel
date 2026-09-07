// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CentralSupportCard from '../src/components/help/CentralSupportCard';

describe('CentralSupportCard', () => {
  it('keeps phone and email visible when the Hub launcher is disabled', () => {
    render(<CentralSupportCard />);

    expect(screen.getByRole('link', { name: '(877) 521-2890' }))
      .toHaveAttribute('href', 'tel:+18775212890');
    expect(screen.getByRole('link', { name: 'support@caremetric.ai' }))
      .toHaveAttribute('href', 'mailto:support@caremetric.ai');
    expect(screen.queryByRole('link', { name: /open caremetric help center/i })).not.toBeInTheDocument();
  });

  it('shows the fixed Hub launcher when a safe URL is supplied', () => {
    const hubUrl = 'https://support-hub-web-production.up.railway.app/help?product=caremetric-intel';
    render(<CentralSupportCard hubUrl={hubUrl} />);

    expect(screen.getByRole('link', { name: /open caremetric help center/i }))
      .toHaveAttribute('href', hubUrl);
  });
});
