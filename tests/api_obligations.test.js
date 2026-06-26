const request = require("supertest");
const app = require("../server");
const db = require("../config/database");
const bcrypt = require("bcrypt");

describe("API Endpoints", () => {
  let agent, memberId;

  beforeAll(async () => {
    await db.run("PRAGMA foreign_keys = OFF;");
    await db.run("DELETE FROM transactions WHERE 1=1");
    await db.run("DELETE FROM loans WHERE 1=1");
    await db.run("DELETE FROM members WHERE 1=1");
    await db.run("DELETE FROM audit_logs WHERE 1=1");
    await db.run("DELETE FROM users WHERE 1=1");
    await db.run("PRAGMA foreign_keys = ON;");

    const hash = bcrypt.hashSync("apipass", 10);
    await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      ["apiuser", hash, "admin"],
    );

    const memberRes = await db.run(
      "INSERT INTO members (name, contact, status) VALUES (?, ?, ?)",
      ["Member", "9876543210", "active"],
    );
    memberId = memberRes.lastID;

    agent = request.agent(app);
    await agent
      .post("/login")
      .send({ username: "apiuser", password: "apipass" });
  });

  it("should calculate monthly obligation", async () => {
    const response = await agent.get(
      `/api/monthly-obligation/${memberId}/2024-01`,
    );
    expect(response.status).toBe(200);
  });

  it("should return obligation as JSON", async () => {
    const response = await agent.get(
      `/api/monthly-obligation/${memberId}/2024-02`,
    );
    expect(response.headers["content-type"]).toMatch(/json/);
  });

  it("should include contribution amount", async () => {
    const response = await agent.get(
      `/api/monthly-obligation/${memberId}/2024-03`,
    );
    expect(response.body).toHaveProperty("contributionAmount");
  });

  it("should include total due", async () => {
    const response = await agent.get(
      `/api/monthly-obligation/${memberId}/2024-04`,
    );
    expect(response.body).toHaveProperty("totalDue");
  });

  afterAll(async () => {
    await db.run("PRAGMA foreign_keys = OFF;");
    await db.run("DELETE FROM transactions WHERE 1=1");
    await db.run("DELETE FROM loans WHERE 1=1");
    await db.run("DELETE FROM members WHERE 1=1");
    await db.run("DELETE FROM audit_logs WHERE 1=1");
    await db.run("DELETE FROM users WHERE 1=1");
    await db.run("PRAGMA foreign_keys = ON;");
  });
});
