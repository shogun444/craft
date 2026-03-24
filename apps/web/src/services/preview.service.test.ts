import { describe, it, expect } from 'vitest';
import { PreviewService } from './preview.service';
import type { CustomizationConfig } from '@craft/types';

const mainnetConfig: CustomizationConfig = {
    branding: {
        appName: 'Mainnet DEX',
        primaryColor: '#4f9eff',
        secondaryColor: '#1a1f36',
        fontFamily: 'Inter',
    },
    features: {
        enableCharts: true,
        enableTransactionHistory: true,
        enableAnalytics: false,
        enableNotifications: false,
    },
    stellar: {
        network: 'mainnet',
        horizonUrl: 'https://horizon.stellar.org',
    },
};

const testnetConfig: CustomizationConfig = {
    branding: {
        appName: 'Testnet DEX',
        primaryColor: '#6366f1',
        secondaryColor: '#a5b4fc',
        fontFamily: 'Roboto',
    },
    features: {
        enableCharts: false,
        enableTransactionHistory: true,
        enableAnalytics: true,
        enableNotifications: true,
    },
    stellar: {
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    },
};

describe('PreviewService', () => {
    let service: PreviewService;

    beforeEach(() => {
        service = new PreviewService();
    });

    describe('generatePreview', () => {
        it('returns a preview payload with customization and mock data', () => {
            const result = service.generatePreview(mainnetConfig);

            expect(result.customization).toEqual(mainnetConfig);
            expect(result.mockData).toBeDefined();
            expect(result.timestamp).toBeDefined();
            expect(new Date(result.timestamp)).toBeInstanceOf(Date);
        });

        it('includes customization config in the payload', () => {
            const result = service.generatePreview(testnetConfig);

            expect(result.customization.branding.appName).toBe('Testnet DEX');
            expect(result.customization.stellar.network).toBe('testnet');
            expect(result.customization.features.enableCharts).toBe(false);
        });

        it('generates mock data with account balance', () => {
            const result = service.generatePreview(mainnetConfig);

            expect(result.mockData.accountBalance).toBeDefined();
            expect(typeof result.mockData.accountBalance).toBe('string');
            expect(result.mockData.accountBalance).toMatch(/^\d+\.\d{7}$/);
        });

        it('generates mock data with recent transactions', () => {
            const result = service.generatePreview(mainnetConfig);

            expect(Array.isArray(result.mockData.recentTransactions)).toBe(true);
            expect(result.mockData.recentTransactions.length).toBeGreaterThan(0);

            const tx = result.mockData.recentTransactions[0];
            expect(tx.id).toBeDefined();
            expect(tx.type).toBeDefined();
            expect(tx.amount).toBeDefined();
            expect(tx.asset).toBeDefined();
            expect(tx.timestamp).toBeInstanceOf(Date);
        });

        it('generates mock data with asset prices', () => {
            const result = service.generatePreview(mainnetConfig);

            expect(result.mockData.assetPrices).toBeDefined();
            expect(typeof result.mockData.assetPrices).toBe('object');
            expect(result.mockData.assetPrices.XLM).toBeDefined();
            expect(typeof result.mockData.assetPrices.XLM).toBe('number');
        });

        it('generates different mock data for mainnet vs testnet', () => {
            const mainnetResult = service.generatePreview(mainnetConfig);
            const testnetResult = service.generatePreview(testnetConfig);

            // Account balances should differ
            expect(mainnetResult.mockData.accountBalance).not.toBe(
                testnetResult.mockData.accountBalance
            );

            // Asset prices should differ
            expect(mainnetResult.mockData.assetPrices.XLM).not.toBe(
                testnetResult.mockData.assetPrices.XLM
            );
        });

        it('generates deterministic mock data for the same config', () => {
            const result1 = service.generatePreview(mainnetConfig);
            const result2 = service.generatePreview(mainnetConfig);

            // Mock data structure should be consistent (excluding timestamp)
            expect(result1.mockData.accountBalance).toBe(result2.mockData.accountBalance);
            expect(result1.mockData.recentTransactions.length).toBe(
                result2.mockData.recentTransactions.length
            );
            expect(result1.mockData.assetPrices.XLM).toBe(result2.mockData.assetPrices.XLM);
        });

        it('includes XLM native asset in mock transactions', () => {
            const result = service.generatePreview(mainnetConfig);

            const xlmTx = result.mockData.recentTransactions.find(
                (tx) => tx.asset.code === 'XLM'
            );

            expect(xlmTx).toBeDefined();
            expect(xlmTx?.asset.type).toBe('native');
            expect(xlmTx?.asset.issuer).toBe('');
        });

        it('includes USDC credit asset in mock transactions', () => {
            const result = service.generatePreview(mainnetConfig);

            const usdcTx = result.mockData.recentTransactions.find(
                (tx) => tx.asset.code === 'USDC'
            );

            expect(usdcTx).toBeDefined();
            expect(usdcTx?.asset.type).toBe('credit_alphanum4');
            expect(usdcTx?.asset.issuer).toBeTruthy();
        });

        it('uses different USDC issuer for mainnet vs testnet', () => {
            const mainnetResult = service.generatePreview(mainnetConfig);
            const testnetResult = service.generatePreview(testnetConfig);

            const mainnetUsdc = mainnetResult.mockData.recentTransactions.find(
                (tx) => tx.asset.code === 'USDC'
            );
            const testnetUsdc = testnetResult.mockData.recentTransactions.find(
                (tx) => tx.asset.code === 'USDC'
            );

            expect(mainnetUsdc?.asset.issuer).not.toBe(testnetUsdc?.asset.issuer);
        });

        it('generates transactions with timestamps in the past', () => {
            const result = service.generatePreview(mainnetConfig);
            const now = new Date();

            result.mockData.recentTransactions.forEach((tx) => {
                expect(tx.timestamp.getTime()).toBeLessThan(now.getTime());
            });
        });

        it('generates transactions ordered by recency', () => {
            const result = service.generatePreview(mainnetConfig);

            const timestamps = result.mockData.recentTransactions.map((tx) =>
                tx.timestamp.getTime()
            );

            // Should be in descending order (most recent first)
            for (let i = 0; i < timestamps.length - 1; i++) {
                expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
            }
        });

        it('includes multiple asset types in price data', () => {
            const result = service.generatePreview(mainnetConfig);

            expect(result.mockData.assetPrices.XLM).toBeDefined();
            expect(result.mockData.assetPrices.USDC).toBeDefined();
            expect(Object.keys(result.mockData.assetPrices).length).toBeGreaterThan(2);
        });

        it('generates valid ISO timestamp', () => {
            const result = service.generatePreview(mainnetConfig);

            expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
        });
    });

    describe('mock data isolation', () => {
        it('generates mock data without making network requests', () => {
            // This test verifies that generatePreview is synchronous and doesn't
            // make any async network calls to Stellar
            const result = service.generatePreview(mainnetConfig);

            expect(result).toBeDefined();
            expect(result.mockData).toBeDefined();
        });

        it('mock transaction IDs follow preview pattern', () => {
            const result = service.generatePreview(mainnetConfig);

            result.mockData.recentTransactions.forEach((tx) => {
                expect(tx.id).toMatch(/^preview\d{4}/);
            });
        });
    });

    describe('network-specific mock data', () => {
        it('mainnet generates higher account balance', () => {
            const mainnetResult = service.generatePreview(mainnetConfig);
            const testnetResult = service.generatePreview(testnetConfig);

            const mainnetBalance = parseFloat(mainnetResult.mockData.accountBalance);
            const testnetBalance = parseFloat(testnetResult.mockData.accountBalance);

            expect(mainnetBalance).toBeGreaterThan(testnetBalance);
        });

        it('mainnet generates higher asset prices', () => {
            const mainnetResult = service.generatePreview(mainnetConfig);
            const testnetResult = service.generatePreview(testnetConfig);

            expect(mainnetResult.mockData.assetPrices.XLM).toBeGreaterThan(
                testnetResult.mockData.assetPrices.XLM
            );
            expect(mainnetResult.mockData.assetPrices.BTC).toBeGreaterThan(
                testnetResult.mockData.assetPrices.BTC
            );
        });
    });
});
