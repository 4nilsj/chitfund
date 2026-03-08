const { calculateEMI } = require('../utils/helpers');

describe('Financial Logic Unit Tests', () => {

    test('calculateEMI - Simple Interest Standard Case', () => {
        // P=10000, R=2% (Monthly), N=10 months
        // Interest = 10000 * 2 * 10 / 100 = 2000
        // Total = 12000
        // EMI = 12000 / 10 = 1200
        expect(calculateEMI(10000, 2, 10)).toBe(1200);
    });

    test('calculateEMI - Rounding Check', () => {
        // P=5000, R=1.5, N=12
        // Interest = 5000 * 1.5 * 12 / 100 = 900
        // Total = 5900
        // EMI = 5900 / 12 = 491.666 -> 492
        expect(calculateEMI(5000, 1.5, 12)).toBe(492);
    });

    test('calculateEMI - Zero Principal', () => {
        expect(calculateEMI(0, 2, 10)).toBe(0);
    });

    test('calculateEMI - Invalid Inputs', () => {
        expect(calculateEMI('abc', 2, 10)).toBe(0);
        expect(calculateEMI(1000, 'xyz', 10)).toBe(0);
    });
});
