const request = require("supertest");
const app = require("../server");
const db = require("../config/database");
const bcrypt = require("bcrypt");

describe("Dashboard API", () => {
  let agent;

  beforeAll(async () => {
    await db.run("PRAGMA foreign_keys = ON;");
    await db.run("DELETE FROM users WHERE 1=1");

    const hash = bcrypt.hashSync("dashpass", 10);
    await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      ["dashuser", hash, "admin"],
    );

    agent = request.agent(app);
    await agent
      .post("/login")
      .send({ username: "dashuser", password: "dashpass" });
  });

  it("should render dashboard at GET /", async () => {
    const response = await agent.get("/");
    expect(response.status).toBe(200);
  });

  it("should export data as JSON", async () => {
    const response = await agent.get("/dashboard/export");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/json/);
  });

  it("should include backup headers", async () => {
    const response = await agent.get("/dashboard/export");
    expect(response.headers["content-disposition"]).toContain("attachment");
  });

  it("should handle collection details", async () => {
    const response = await agent.get("/dashboard/collection-details");
    expect(response.status).toBe(200);
    if (response.status === 200) {
      expect(response.body.success).toBe(true);
    }
  });

  afterAll(async () => {
    await db.run("DELETE FROM users WHERE 1=1");
  });
});
