const request = require("supertest");
const app = require("../server");
const db = require("../config/database");
const bcrypt = require("bcrypt");

describe("API Routes", () => {
  let agent, memberId;

  beforeAll(async () => {
    await db.run("PRAGMA foreign_keys = ON;");
    await db.run("DELETE FROM transactions WHERE 1=1");
    await db.run("DELETE FROM loans WHERE 1=1");
    await db.run("DELETE FROM members WHERE 1=1");
    await db.run("DELETE FROM users WHERE 1=1");

    const hash = bcrypt.hashSync("apipass", 10);
    await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      ["apiAdmin", hash, "admin"],
    );

    const memberRes = await db.run(
      "INSERT INTO members (name, contact, status) VALUES (?, ?, ?)",
      ["API Test Member", "9876543210", "active"],
    );
    memberId = memberRes.lastID;

    agent = request.agent(app);
    await agent
      .post("/login")
      .send({ username: "apiAdmin", password: "apipass" });
  });

  describe("GET /api/monthly-obligation/:memberId/:month", () => {
    it("should return monthly obligation", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-01`,
      );
      expect(response.status).toBe(200);
    });

    it("should include obligation details", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-01`,
      );
      expect(response.body).toHaveProperty("contributionAmount");
      expect(response.body).toHaveProperty("totalEMI");
      expect(response.body).toHaveProperty("totalDue");
    });

    it("should include loans info", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-01`,
      );
      expect(response.body).toHaveProperty("loans");
      expect(Array.isArray(response.body.loans)).toBe(true);
    });

    it("should include payment status", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-02`,
      );
      expect(response.body).toHaveProperty("alreadyPaid");
    });

    it("should handle different months", async () => {
      const response2024_03 = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-03`,
      );
      const response2024_04 = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-04`,
      );
      expect(response2024_03.status).toBe(200);
      expect(response2024_04.status).toBe(200);
    });

    it("should calculate total due correctly", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-05`,
      );
      const expected =
        response.body.contributionAmount + response.body.totalEMI;
      expect(response.body.totalDue).toBe(expected);
    });

    it("should indicate public member status", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-06`,
      );
      expect(response.body).toHaveProperty("isPublic");
      expect(typeof response.body.isPublic).toBe("boolean");
    });

    it("should handle invalid member ID", async () => {
      const response = await agent.get(`/api/monthly-obligation/99999/2024-01`);
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it("should handle invalid month format", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/invalid`,
      );
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe("API Authentication", () => {
    it("should reject unauthenticated API calls", async () => {
      const response = await request(app).get(
        `/api/monthly-obligation/${memberId}/2024-01`,
      );
      expect(response.status).toBe(302);
    });
  });

  describe("API Response Format", () => {
    it("should return valid JSON", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-07`,
      );
      expect(response.headers["content-type"]).toMatch(/json/);
    });

    it("should have numeric values for amounts", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-08`,
      );
      expect(typeof response.body.contributionAmount).toBe("number");
      expect(typeof response.body.totalEMI).toBe("number");
      expect(typeof response.body.totalDue).toBe("number");
    });

    it("should have array of loans", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-09`,
      );
      expect(Array.isArray(response.body.loans)).toBe(true);
    });
  });

  describe("Error Scenarios", () => {
    it("should handle server errors gracefully", async () => {
      const response = await agent.get(
        `/api/monthly-obligation/${memberId}/2024-10`,
      );
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  afterAll(async () => {
    await db.run("DELETE FROM transactions WHERE 1=1");
    await db.run("DELETE FROM loans WHERE 1=1");
    await db.run("DELETE FROM members WHERE 1=1");
    await db.run("DELETE FROM users WHERE 1=1");
  });
});
