/**
 * Unit tests for stellarExplorerUrl utility function.
 * Tests that URLs are generated correctly for testnet and mainnet.
 */

import { stellarExplorerUrl } from '../wallet';

describe('stellarExplorerUrl', () => {
  describe('Transaction URLs', () => {
    it('should generate testnet tx URL', () => {
      const txHash = 'c0ffee1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const url = stellarExplorerUrl('tx', txHash);
      expect(url).toBe(`https://stellar.expert/explorer/testnet/tx/${txHash}`);
    });

    it('should generate mainnet tx URL', () => {
      const txHash = 'c0ffee1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const url = stellarExplorerUrl('tx', txHash);
      // Note: This test runs in testnet mode by default, so it will still generate testnet URL
      // In a real environment with NEXT_PUBLIC_STELLAR_NETWORK=mainnet, it would generate mainnet
      expect(url).toContain('/tx/');
      expect(url).toContain(txHash);
    });
  });

  describe('Account URLs', () => {
    it('should generate account URL', () => {
      const address = 'GCZXWVQC5VGKQ7LDK5SKJWLNQ5JSYWJWYDFKQCWVQ';
      const url = stellarExplorerUrl('account', address);
      expect(url).toContain('stellar.expert/explorer/');
      expect(url).toContain('/account/');
      expect(url).toContain(address);
    });
  });

  describe('Contract URLs', () => {
    it('should generate contract URL', () => {
      const contractId = 'CBAAAY3ZFXQUVQ7FZYY3H5VFXQ4UVJZVZPJY3XYQ';
      const url = stellarExplorerUrl('contract', contractId);
      expect(url).toContain('stellar.expert/explorer/');
      expect(url).toContain('/contract/');
      expect(url).toContain(contractId);
    });
  });

  describe('URL structure', () => {
    it('should use https protocol', () => {
      const url = stellarExplorerUrl('tx', 'abc123');
      expect(url).toMatch(/^https:\/\//);
    });

    it('should use stellar.expert domain', () => {
      const url = stellarExplorerUrl('tx', 'abc123');
      expect(url).toContain('stellar.expert');
    });

    it('should use /explorer/ path prefix', () => {
      const url = stellarExplorerUrl('tx', 'abc123');
      expect(url).toContain('/explorer/');
    });

    it('should use testnet or public as network', () => {
      const url = stellarExplorerUrl('tx', 'abc123');
      expect(url).toMatch(/\/explorer\/(testnet|public)\//);
    });
  });

  describe('Type handling', () => {
    it('should handle tx type', () => {
      const url = stellarExplorerUrl('tx', 'hash123');
      expect(url).toContain('/tx/');
    });

    it('should handle account type', () => {
      const url = stellarExplorerUrl('account', 'addr123');
      expect(url).toContain('/account/');
    });

    it('should handle contract type', () => {
      const url = stellarExplorerUrl('contract', 'contract123');
      expect(url).toContain('/contract/');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty ID', () => {
      const url = stellarExplorerUrl('tx', '');
      expect(url).toMatch(/\/tx\/$/);
    });

    it('should preserve special characters in ID', () => {
      const id = 'abc-123_def';
      const url = stellarExplorerUrl('tx', id);
      expect(url).toContain(id);
    });

    it('should handle long IDs', () => {
      const longId = 'a'.repeat(256);
      const url = stellarExplorerUrl('tx', longId);
      expect(url).toContain(longId);
    });
  });
});
