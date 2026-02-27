import { describe, it, expect } from 'vitest';
import { stripHtml, stellarAddress, buySharesBody } from '../../src/schemas/validation.schemas.js';

describe('Security Audit - Input Sanitization & Validation', () => {
    describe('XSS Sanitization (stripHtml)', () => {
        it('should strip script tags and their content', () => {
            const input = 'Check out this market! <script>alert("XSS")</script>';
            expect(stripHtml(input)).toBe('Check out this market! ');
        });

        it('should strip inline event handlers', () => {
            const input = '<img src=x onerror=alert(1)> Click me';
            // Our stripHtml replaces on\w+="[^"]*" with empty string
            const result = stripHtml(input);
            expect(result).not.toContain('onerror');
            expect(result).not.toContain('alert');
        });

        it('should strip style tags', () => {
            const input = 'Normal text <style>body { background: red; }</style>';
            expect(stripHtml(input)).toBe('Normal text ');
        });

        it('should strip javascript: pseudo-protocol', () => {
            const input = '<a href="javascript:alert(1)">Click</a>';
            const result = stripHtml(input);
            expect(result).not.toContain('javascript:');
            expect(result).toBe('Click');
        });

        it('should strip multiple tags and handle nested-like structures', () => {
            const input = '<div><b>Title</b><p>Message <img src="x" onmouseover="evil()"></p></div>';
            expect(stripHtml(input)).toBe('TitleMessage ');
        });
    });

    describe('Stellar Address Validation (checksum)', () => {
        it('should accept valid Stellar public keys', () => {
            const realValidKey = 'GAMCVGJFOWWCF6N7YSS66DEZQSCGWZU2SCOWIA2NTMCKTODDTPUOOYDY';
            expect(stellarAddress.safeParse(realValidKey).success).toBe(true);
        });

        it('should reject keys with invalid format', () => {
            expect(stellarAddress.safeParse('not-a-key').success).toBe(false);
            expect(stellarAddress.safeParse('B' + 'A'.repeat(55)).success).toBe(false);
        });

        it('should reject keys with valid format but invalid checksum', () => {
            // G followed by 55 chars, but checksum is likely wrong
            const invalidChecksumKey = 'G' + 'A'.repeat(55);
            expect(stellarAddress.safeParse(invalidChecksumKey).success).toBe(false);
        });
    });

    describe('Numeric Input Validation (Trading)', () => {
        it('should reject negative amounts', () => {
            const result = buySharesBody.safeParse({
                outcome: 1,
                amount: '-100',
                minShares: '0'
            });
            expect(result.success).toBe(false);
        });

        it('should reject zero amounts if required to be > 0', () => {
            const result = buySharesBody.safeParse({
                outcome: 1,
                amount: '0',
                minShares: '0'
            });
            expect(result.success).toBe(false);
        });

        it('should reject non-numeric strings for amounts', () => {
            const result = buySharesBody.safeParse({
                outcome: 1,
                amount: 'abc',
                minShares: '0'
            });
            expect(result.success).toBe(false);
        });

        it('should reject extremely large numbers (overflow protection)', () => {
            const result = buySharesBody.safeParse({
                outcome: 1,
                amount: '999999999999999999999999999999999999', // very large
                minShares: '0'
            });
            expect(result.success).toBe(false);
        });

        it('should accept valid numeric strings', () => {
            const result = buySharesBody.safeParse({
                outcome: 1,
                amount: '1000000', // 1 USDC
                minShares: '900000'
            });
            expect(result.success).toBe(true);
        });
    });
});
