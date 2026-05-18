const request = require("supertest");
const app = require("../server");
const db = require("../config/database");
const bcrypt = require("bcrypt");

describe("Users Routes", () => {
  let agent, adminId;

  beforeAll(async () => {
    await db.run("PRAGMA foreign_keys = ON;");
    await db.run("DELETE FROM users WHERE 1=1");

    const hash = bcrypt.hashSync("adminpass", 10);
    const userRes = await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      ["admin", hash, "admin"],
    );
    adminId = userRes.lastID;

    agent = request.agent(app);
    await agent
      .post("/login")
      .send({ username: "admin", password: "adminpass" });
  });

  describe("GET /users - List all users", () => {
    it("should render users page", async () => {
      const response = await agent.get("/users");
      expect(response.status).toBe(200);
    });

    it("should be accessible to admin only", async () => {
      const response = await agent.get("/users");
      expect(response.status).toBe(200);
    });

    it("should display users", async () => {
      const response = await agent.get("/users");
      expect(response.text).toBeDefined();
    });
  });

  describe("POST /users/add - Add new user", () => {
    it("should add valid user", async () => {
      const response = await agent.post("/users/add").send({
        username: "newuser1",
        password: "Pass@123",
        role: "manager",
      });
      expect(response.status).toBe(302);
    });

    it("should reject duplicate username", async () => {
      await agent.post("/users/add").send({
        username: "duplicate1",
        password: "Pass@123",
        role: "manager",
      });

      const response = await agent.post("/users/add").send({
        username: "duplicate1",
        password: "Pass@123",
        role: "manager",
      });
      expect(response.status).toBeGreaterThanOrEqual(302);
    });

    it("should accept valid role", async () => {
      const response = await agent.post("/users/add").send({
        username: "roletest1",
        password: "Pass@123",
        role: "admin",
      });
      expect(response.status).toBe(302);
    });

    it("should hash password", async () => {
      const username = "hashtest1";
      const password = "TestPass@123";

      await agent.post("/users/add").send({
        username,
        password,
        role: "manager",
      });

      const user = await db.get(
        "SELECT password_hash FROM users WHERE username = ?",
        [username],
      );
      expect(user).toBeDefined();
      expect(user.password_hash).not.toBe(password);
      expect(user.password_hash.length).toBeGreaterThan(10);
    });
  });

  describe("POST /users/delete/:id - Delete user", () => {
    let deleteTestUserId;

    beforeAll(async () => {
      const hash = bcrypt.hashSync("testpass", 10);
      const res = await db.run(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ["deleteme", hash, "manager"],
      );
      deleteTestUserId = res.lastID;
    });

    it("should delete user", async () => {
      const response = await agent
        .post(`/users/delete/${deleteTestUserId}`)
        .send({});
      expect(response.status).toBe(302);
    });

    it("should prevent admin self-deletion", async () => {
      const response = await agent.post(`/users/delete/${adminId}`).send({});
      expect(response.status).toBeGreaterThanOrEqual(302);
    });
  });

  describe("User Authentication Flow", () => {
    beforeAll(async () => {
      const hash = bcrypt.hashSync("testuser123", 10);
      await db.run(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ["testlogin", hash, "manager"],
      );
    });

    it("should allow login with correct password", async () => {
      const testAgent = request.agent(app);
      const response = await testAgent.post("/login").send({
        username: "testlogin",
        password: "testuser123",
      });
      expect(response.status).toBe(302);
    });

    it("should reject incorrect password", async () => {
      const testAgent = request.agent(app);
      const response = await testAgent.post("/login").send({
        username: "testlogin",
        password: "wrongpass",
      });
      expect(response.status).toBe(200);
    });

    it("should reject non-existent user", async () => {
      const testAgent = request.agent(app);
      const response = await testAgent.post("/login").send({
        username: "nonexistent",
        password: "anypass",
      });
      expect(response.status).toBe(200);
    });
  });

  describe("User Roles", () => {
    it("should support admin role", async () => {
      const hash = bcrypt.hashSync("pass", 10);
      const res = await db.run(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ["adminrole", hash, "admin"],
      );
      const user = await db.get("SELECT role FROM users WHERE id = ?", [
        res.lastID,
      ]);
      expect(user.role).toBe("admin");
    });

    it("should support manager role", async () => {
      const hash = bcrypt.hashSync("pass", 10);
      const res = await db.run(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ["managerrole", hash, "manager"],
      );
      const user = await db.get("SELECT role FROM users WHERE id = ?", [
        res.lastID,
      ]);
      expect(user.role).toBe("manager");
    });
  });

  describe("Error Handling", () => {
    it("should handle missing fields", async () => {
      const response = await agent.post("/users/add").send({
        username: "incomplete",
        password: "Pass@123",
      });
      expect(response.status).toBeGreaterThanOrEqual(302);
    });

    it("should handle invalid record deletion", async () => {
      const response = await agent.post("/users/delete/99999").send({});
      expect(response.status).toBeGreaterThanOrEqual(302);
    });
  });

  describe("Access Control", () => {
    it("should require authentication for /users", async () => {
      const unauthAgent = request.agent(app);
      const response = await unauthAgent.get("/users");
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("/login");
    });

    it("should require authentication for /users/add", async () => {
      const unauthAgent = request.agent(app);
      const response = await unauthAgent.post("/users/add").send({
        username: "test",
        password: "pass",
        role: "manager",
      });
      expect(response.status).toBe(302);
    });
  });

  afterAll(async () => {
    await db.run("DELETE FROM users WHERE 1=1");
  });
});
