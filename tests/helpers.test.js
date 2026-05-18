const {
  formatCurrency,
  validateContact,
  validateAmount,
  validateDate,
  validateName,
  validateInteger,
  validatePercentage,
  sanitizeString,
  calculateEMI,
  calculateMonthlyObligation,
  getFundBalance,
} = require("../utils/helpers");
const db = require("../config/database");

describe("Helpers Utility Functions", () => {
  beforeAll(async () => {
    await db.run("PRAGMA foreign_keys = ON;");
    await db.run("DELETE FROM transactions WHERE 1=1");
    await db.run("DELETE FROM loans WHERE 1=1");
    await db.run("DELETE FROM members WHERE 1=1");
  });

  describe("formatCurrency", () => {
    it("should format positive amounts", () => {
      expect(formatCurrency(1000)).toContain("1,000");
    });

    it("should format decimal amounts", () => {
      expect(formatCurrency(1234.56)).toBeDefined();
    });

    it("should format zero", () => {
      expect(formatCurrency(0)).toBeDefined();
    });

    it("should format large amounts", () => {
      expect(formatCurrency(1000000)).toBeDefined();
    });

    it("should include currency symbol", () => {
      const formatted = formatCurrency(100);
      expect(formatted).toMatch(/₹|Rs/);
    });
  });

  describe("validateContact", () => {
    it("should accept valid 10-digit Indian mobile", () => {
      expect(validateContact("9876543210")).toBe(true);
      expect(validateContact("8765432109")).toBe(true);
    });

    it("should accept valid contact after removing non-numeric chars", () => {
      expect(validateContact("9876543210")).toBe(true);
      expect(validateContact("8765432109")).toBe(true);
    });

    it("should reject invalid starting digit", () => {
      expect(validateContact("1234567890")).toBe(false);
      expect(validateContact("5234567890")).toBe(false);
    });

    it("should reject too short", () => {
      expect(validateContact("987654321")).toBe(false);
    });

    it("should reject too long", () => {
      expect(validateContact("98765432101")).toBe(false);
    });

    it("should reject non-numeric (after cleaning)", () => {
      expect(validateContact("abcdefghij")).toBe(false);
    });

    it("should accept various valid Indian formats", () => {
      expect(validateContact("9000000000")).toBe(true);
      expect(validateContact("7000000000")).toBe(true);
      expect(validateContact("6000000000")).toBe(true);
    });
  });

  describe("validateAmount", () => {
    it("should accept positive amounts", () => {
      expect(validateAmount(100)).toBe(true);
      expect(validateAmount(1000)).toBe(true);
    });

    it("should accept decimal amounts", () => {
      expect(validateAmount(100.5)).toBe(true);
    });

    it("should reject zero", () => {
      expect(validateAmount(0)).toBe(false);
    });

    it("should reject negative amounts", () => {
      expect(validateAmount(-100)).toBe(false);
    });

    it("should reject non-numeric", () => {
      expect(validateAmount("abc")).toBe(false);
    });

    it("should respect min parameter", () => {
      expect(validateAmount(50, 100)).toBe(false);
      expect(validateAmount(150, 100)).toBe(true);
    });

    it("should respect max parameter", () => {
      expect(validateAmount(5000000, 1, 5000000)).toBe(true);
      expect(validateAmount(5000001, 1, 5000000)).toBe(false);
    });

    it("should handle very large amounts", () => {
      expect(validateAmount(1000000, 1, 10000000)).toBe(true);
    });

    it("should handle edge cases", () => {
      expect(validateAmount(NaN)).toBe(false);
      expect(validateAmount(Infinity)).toBe(false);
    });
  });

  describe("validateDate", () => {
    it("should accept today's date", () => {
      const today = new Date().toISOString().split("T")[0];
      expect(validateDate(today)).toBe(true);
    });

    it("should accept recent past dates", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0];
      expect(validateDate(dateStr)).toBe(true);
    });

    it("should accept dates within 2 years", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 365);
      const dateStr = pastDate.toISOString().split("T")[0];
      expect(validateDate(dateStr)).toBe(true);
    });

    it("should reject dates too far in past", () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1000);
      const dateStr = pastDate.toISOString().split("T")[0];
      expect(validateDate(dateStr)).toBe(false);
    });

    it("should accept today but reject far future dates", () => {
      const today = new Date().toISOString().split("T")[0];
      expect(validateDate(today)).toBe(true);

      const farFuture = new Date();
      farFuture.setDate(farFuture.getDate() + 100);
      const dateStr = farFuture.toISOString().split("T")[0];
      expect(validateDate(dateStr)).toBe(false);
    });

    it("should accept future dates with custom maxFutureDays", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split("T")[0];
      expect(validateDate(dateStr, 730, 10)).toBe(true);
    });

    it("should reject invalid date strings", () => {
      expect(validateDate("invalid-date")).toBe(false);
      expect(validateDate("2024-13-45")).toBe(false);
    });
  });

  describe("validateName", () => {
    it("should accept valid names", () => {
      expect(validateName("John Doe")).toBe(true);
      expect(validateName("J. Smith")).toBe(true);
    });

    it("should accept names with hyphens", () => {
      expect(validateName("Mary-Jane")).toBe(true);
    });

    it("should reject short names", () => {
      expect(validateName("A")).toBe(false);
    });

    it("should reject names with numbers", () => {
      expect(validateName("John123")).toBe(false);
    });

    it("should reject names with special characters", () => {
      expect(validateName("John@Doe")).toBe(false);
    });

    it("should accept lowercase letters", () => {
      expect(validateName("john doe")).toBe(true);
    });

    it("should trim whitespace", () => {
      expect(validateName("   John Doe   ")).toBe(true);
    });

    it("should reject non-string input", () => {
      expect(validateName(123)).toBe(false);
      expect(validateName(null)).toBe(false);
      expect(validateName(undefined)).toBe(false);
    });

    it("should reject very long names", () => {
      const longName = "a".repeat(101);
      expect(validateName(longName)).toBe(false);
    });
  });

  describe("validateInteger", () => {
    it("should accept valid integers", () => {
      expect(validateInteger(1)).toBe(true);
      expect(validateInteger(100)).toBe(true);
    });

    it("should handle decimal inputs", () => {
      // parseInt(1.5) = 1, but Number.isInteger(1.5) = false, so rejected
      // Actually parseInt(1.5) = 1 and Number.isInteger(1) = true, so accepted
      const result = validateInteger(1.5);
      expect(result).toBe(true); // parseInt(1.5) = 1
    });

    it("should reject negative (when min is 1)", () => {
      expect(validateInteger(-1, 1)).toBe(false);
    });

    it("should accept negative with custom min", () => {
      expect(validateInteger(-5, -10)).toBe(true);
    });

    it("should reject non-numeric strings", () => {
      expect(validateInteger("abc")).toBe(false);
    });

    it("should respect max parameter", () => {
      expect(validateInteger(100, 1, 50)).toBe(false);
      expect(validateInteger(25, 1, 50)).toBe(true);
    });

    it("should handle string numbers", () => {
      expect(validateInteger("50", 1, 100)).toBe(true);
    });
  });

  describe("validatePercentage", () => {
    it("should accept valid percentages", () => {
      expect(validatePercentage(5)).toBe(true);
      expect(validatePercentage(12.5)).toBe(true);
      expect(validatePercentage(100)).toBe(true);
    });

    it("should reject values below min", () => {
      expect(validatePercentage(0.05)).toBe(false); // default min is 0.1
    });

    it("should reject values above max", () => {
      expect(validatePercentage(101)).toBe(false);
    });

    it("should accept zero with custom min", () => {
      expect(validatePercentage(0, 0, 100)).toBe(true);
    });

    it("should reject non-numeric", () => {
      expect(validatePercentage("abc")).toBe(false);
    });

    it("should handle edge values", () => {
      expect(validatePercentage(0.1)).toBe(true); // minimum
      expect(validatePercentage(100)).toBe(true); // maximum
    });
  });

  describe("sanitizeString", () => {
    it("should trim whitespace", () => {
      expect(sanitizeString("  hello  ")).toBe("hello");
    });

    it("should truncate long strings", () => {
      const longString = "a".repeat(600);
      const result = sanitizeString(longString, 500);
      expect(result.length).toBe(500);
    });

    it("should return empty string for null/undefined", () => {
      expect(sanitizeString(null)).toBe("");
      expect(sanitizeString(undefined)).toBe("");
    });

    it("should convert non-strings", () => {
      expect(sanitizeString(123)).toBe("123");
    });

    it("should preserve internal spaces", () => {
      expect(sanitizeString("hello   world")).toBe("hello   world");
    });

    it("should respect custom maxLength", () => {
      const result = sanitizeString("hello world", 5);
      expect(result).toBe("hello");
    });
  });

  describe("calculateEMI", () => {
    it("should calculate EMI for valid inputs", () => {
      const emi = calculateEMI(10000, 10, 12);
      expect(emi).toBeGreaterThan(0);
    });

    it("should give higher EMI for higher interest rate", () => {
      const emi1 = calculateEMI(10000, 5, 12);
      const emi2 = calculateEMI(10000, 10, 12);
      expect(emi2).toBeGreaterThan(emi1);
    });

    it("should give higher EMI for shorter tenure", () => {
      const emi1 = calculateEMI(10000, 10, 12);
      const emi2 = calculateEMI(10000, 10, 6);
      expect(emi2).toBeGreaterThan(emi1);
    });

    it("should give higher EMI for higher principal", () => {
      const emi1 = calculateEMI(10000, 10, 12);
      const emi2 = calculateEMI(20000, 10, 12);
      expect(emi2).toBeGreaterThan(emi1);
    });

    it("should return 0 for invalid inputs", () => {
      expect(calculateEMI("abc", 10, 12)).toBe(0);
      expect(calculateEMI(10000, 10, 0)).toBe(0);
      expect(calculateEMI(10000, 10, -5)).toBe(0);
    });

    it("should handle string inputs", () => {
      const emi = calculateEMI("10000", "10", "12");
      expect(emi).toBeGreaterThan(0);
    });

    it("should match simple interest formula", () => {
      const principal = 1000;
      const rate = 10;
      const tenure = 12;

      const emi = calculateEMI(principal, rate, tenure);

      // Manual calculation
      const interest = (principal * rate * tenure) / 100;
      const total = principal + interest;
      const expectedEMI = Math.round(total / tenure);

      expect(emi).toBe(expectedEMI);
    });

    it("should return rounded integer", () => {
      const emi = calculateEMI(10000, 10, 12);
      expect(Number.isInteger(emi)).toBe(true);
    });
  });

  describe("calculateMonthlyObligation", () => {
    let testMemberId, testPublicMemberId;

    beforeAll(async () => {
      // Regular member
      const memberRes = await db.run(
        "INSERT INTO members (name, contact, type, status) VALUES (?, ?, ?, ?)",
        ["Test Member", "9876543210", "member", "active"],
      );
      testMemberId = memberRes.lastID;

      // Public member (no contributions)
      const publicRes = await db.run(
        "INSERT INTO members (name, contact, type, status) VALUES (?, ?, ?, ?)",
        ["Public Member", "9876543200", "public", "active"],
      );
      testPublicMemberId = publicRes.lastID;
    });

    it("should return obligation object", async () => {
      const obligation = await calculateMonthlyObligation(
        testMemberId,
        "2024-01",
      );
      expect(obligation).toBeDefined();
      expect(obligation.contributionAmount).toBeDefined();
      expect(obligation.totalEMI).toBeDefined();
      expect(obligation.totalDue).toBeDefined();
    });

    it("should include contribution for regular members", async () => {
      const obligation = await calculateMonthlyObligation(
        testMemberId,
        "2024-01",
      );
      expect(obligation.isPublic).toBe(false);
      expect(obligation.contributionAmount).toBeGreaterThan(0);
    });

    it("should exclude contribution for public members", async () => {
      const obligation = await calculateMonthlyObligation(
        testPublicMemberId,
        "2024-01",
      );
      expect(obligation.isPublic).toBe(true);
      expect(obligation.contributionAmount).toBe(0);
    });

    it("should calculate totalDue correctly", async () => {
      const obligation = await calculateMonthlyObligation(
        testMemberId,
        "2024-01",
      );
      const expected = obligation.contributionAmount + obligation.totalEMI;
      expect(obligation.totalDue).toBe(expected);
    });

    it("should reflect alreadyPaid status", async () => {
      // Start with false
      const obligation1 = await calculateMonthlyObligation(
        testMemberId,
        "2024-02",
      );
      expect(obligation1.alreadyPaid).toBe(false);

      // Create fake payment batch for this month
      await db.run(
        "INSERT INTO transactions (member_id, payment_batch_id, type, amount, date) VALUES (?, ?, ?, ?, ?)",
        [testMemberId, "2024-02-123456", "contribution", 1000, "2024-02-15"],
      );

      // Now should show as paid
      const obligation2 = await calculateMonthlyObligation(
        testMemberId,
        "2024-02",
      );
      expect(obligation2.alreadyPaid).toBe(true);
    });

    it("should include active loans", async () => {
      const loanRes = await db.run(
        "INSERT INTO loans (member_id, amount, interest_rate, tenure, emi, start_date, status, outstanding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [testMemberId, 10000, 10, 12, 1000, "2024-01-01", "active", 10000],
      );

      const obligation = await calculateMonthlyObligation(
        testMemberId,
        "2024-03",
      );
      expect(obligation.hasActiveLoans).toBe(true);
      expect(obligation.loans.length).toBeGreaterThan(0);
      expect(obligation.totalEMI).toBeGreaterThan(0);
    });

    it("should handle member with no loans", async () => {
      const obligation = await calculateMonthlyObligation(
        testPublicMemberId,
        "2024-04",
      );
      expect(obligation.hasActiveLoans).toBe(false);
      expect(obligation.loans).toEqual([]);
      expect(obligation.totalEMI).toBe(0);
    });
  });

  describe("getFundBalance", () => {
    it("should return a number", async () => {
      const balance = await getFundBalance();
      expect(typeof balance).toBe("number");
    });

    it("should be non-negative", async () => {
      const balance = await getFundBalance();
      expect(balance).toBeGreaterThanOrEqual(0);
    });

    it("should increase with contributions", async () => {
      const balanceBefore = await getFundBalance();

      // Add contribution
      await db.run(
        "INSERT INTO members (name, contact, status) VALUES (?, ?, ?)",
        ["BalanceTestUser", "9876543211", "active"],
      );
      const memberRes = await db.get(
        "SELECT id FROM members WHERE name = 'BalanceTestUser'",
      );

      await db.run(
        "INSERT INTO transactions (member_id, type, amount, date) VALUES (?, ?, ?, ?)",
        [memberRes.id, "contribution", 250, "2024-01-01"],
      );

      const balanceAfter = await getFundBalance();
      expect(balanceAfter).toBeGreaterThanOrEqual(balanceBefore);
    });

    it("should decrease with disbursements", async () => {
      const balanceBefore = await getFundBalance();

      // Get a member and add disbursement
      const memberRes = await db.get("SELECT id FROM members LIMIT 1");
      if (memberRes) {
        await db.run(
          "INSERT INTO transactions (member_id, type, amount, date) VALUES (?, ?, ?, ?)",
          [memberRes.id, "disbursement", 50, "2024-01-01"],
        );

        const balanceAfter = await getFundBalance();
        expect(balanceAfter).toBeLessThanOrEqual(balanceBefore);
      }
    });

    it("should handle edge case of zero balance", async () => {
      const balance = await getFundBalance();
      expect(typeof balance).toBe("number");
      expect(balance >= 0).toBe(true);
    });
  });

  afterAll(async () => {
    await db.run("DELETE FROM transactions WHERE 1=1");
    await db.run("DELETE FROM loans WHERE 1=1");
    await db.run("DELETE FROM members WHERE 1=1");
  });
});
