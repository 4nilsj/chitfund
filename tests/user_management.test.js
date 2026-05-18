const request = require("supertest");
const app = require("../server");
const db = require("../config/database");
const bcrypt = require("bcrypt");

describe("User Management", () => {
  let agent, adminId;

  beforeAll(async () => {
    await db.run("PRAGMA foreign_keys = ON;");
    await db.run("DELETE FROM users WHERE 1=1");

    const hash = bcrypt.hashSync("adminpass", 10);
    const res = await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      ["admin", hash, "admin"],
    );
    adminId = res.lastID;

    agent = request.agent(app);
    await agent
      .post("/login")
      .send({ username: "admin", password: "adminpass" });
  });

  it("should display users page", async () => {
    const response = await agent.get("/users");
    expect(response.status).toBe(200);
  });

  it("should add new user", async () => {
    const response = await agent.post("/users/add").send({
      username: "newuser",
      password: "Pass@123",
      role: "manager",
    });
    expect(response.status).toBe(302);
  });

  it("should hash passwords", async () => {
    await agent.post("/users/add").send({
      username: "hashuser",
      password: "TestPass@123",
      role: "manager",
    });

    const user = await db.get(
      "SELECT password_hash FROM users WHERE username = ?",
      ["hashuser"],
    );
    expect(user.password_hash).not.toBe("TestPass@123");
  });

  it("should support different roles", async () => {
    await agent.post("/users/add").send({
      username: "adminrole",
      password: "Pass@123",
      role: "admin",
    });

    const user = await db.get("SELECT role FROM users WHERE username = ?", [
      "adminrole",
    ]);
    expect(["admin", "manager"]).toContain(user.role);
  });

  it("should delete users", async () => {
    const res = await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      ["todelete", bcrypt.hashSync("pass", 10), "manager"],
    );

    const response = await agent.post(`/users/delete/${res.lastID}`).send({});
    expect(response.status).toBe(302);
  });

  it("should require authentication", async () => {
    const response = await request(app).get("/users");
    expect(response.status).toBe(302);
  });

  afterAll(async () => {
    await db.run("DELETE FROM users WHERE 1=1");
  });
});
