import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PreviewWorkspace } from './PreviewWorkspace';
import { CustomizationConfig, ViewportClass } from '@craft/types';

// Mock the preview service
jest.mock('@/hooks/usePreviewService', () => ({
  usePreviewService: () => ({
    generatePreview: jest.fn().mockResolvedValue({
      branding: { primaryColor: '#6366f1', secondaryColor: '#a5b4fc', fontFamily: 'Inter' },
      features: { enableCharts: true, enableTransactionHistory: true },
      mockData: { accountBalance: '10000', recentTransactions: [] },
      css: 'body { background: #6366f1; }',
      viewport: { width: 1440, height: 900, class: 'desktop' as ViewportClass },
    }),
    refreshPreview: jest.fn().mockResolvedValue({
      branding: { primaryColor: '#6366f1', secondaryColor: '#a5b4fc', fontFamily: 'Inter' },
      features: { enableCharts: true, enableTransactionHistory: true },
      mockData: { accountBalance: '10000', recentTransactions: [] },
      css: 'body { background: #6366f1; }',
      viewport: { width: 1440, height: 900, class: 'desktop' as ViewportClass },
    }),
    isLoading: false,
    error: null,
  }),
}));

// Mock the LoadingSkeleton and ErrorState components
jest.mock('../LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton">Loading...</div>,
}));

jest.mock('../ErrorState', () => ({
  ErrorState: ({ title, description, onRetry }: any) => (
    <div data-testid="error-state">
      <h1>{title}</h1>
      <p>{description}</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

const mockCustomization: CustomizationConfig = {
  branding: {
    appName: 'Test App',
    primaryColor: '#6366f1',
    secondaryColor: '#a5b4fc',
    fontFamily: 'Inter',
  },
  features: {
    enableCharts: true,
    enableTransactionHistory: true,
    enableAnalytics: false,
    enableNotifications: false,
  },
  stellar: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
  },
};

describe('PreviewWorkspace', () => {
  it('renders preview controls and iframe area', () => {
    render(<PreviewWorkspace templateId="test-template" customization={mockCustomization} />);
    
    // Check if viewport switcher is present
    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('Tablet')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    
    // Check if refresh button is present
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('switches viewports correctly', async () => {
    render(<PreviewWorkspace templateId="test-template" customization={mockCustomization} />);
    
    const tabletButton = screen.getByText('Tablet');
    fireEvent.click(tabletButton);
    
    await waitFor(() => {
      expect(tabletButton).toHaveClass('bg-white');
    });
  });

  it('shows loading state initially', () => {
    render(<PreviewWorkspace templateId="test-template" customization={mockCustomization} />);
    
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('handles refresh action', async () => {
    render(<PreviewWorkspace templateId="test-template" customization={mockCustomization} />);
    
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    await waitFor(() => {
      expect(refreshButton).toBeDisabled();
    });
  });

  it('displays viewport dimensions', () => {
    render(<PreviewWorkspace templateId="test-template" customization={mockCustomization} />);
    
    // Desktop dimensions should be visible
    expect(screen.getByText('1440×900')).toBeInTheDocument();
  });

  it('handles missing customization gracefully', () => {
    render(<PreviewWorkspace templateId="test-template" />);
    
    // Should still render controls even without customization
    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });
});
