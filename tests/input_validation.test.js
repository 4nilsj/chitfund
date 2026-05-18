const { body, validationResult } = require("express-validator");
const express = require("express");

describe("Input Validation", () => {
  describe("Date validation", () => {
    let app;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.post(
        "/test",
        [body("date").isISO8601().withMessage("Invalid date")],
        (req, res) => {
          const errors = validationResult(req);
          res.json({ valid: errors.isEmpty() });
        },
      );
    });

    it("should accept valid ISO8601 dates", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ date: "2024-05-18" });
      expect(response.body.valid).toBe(true);
    });

    it("should reject invalid dates", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ date: "invalid" });
      expect(response.body.valid).toBe(false);
    });
  });

  describe("Number validation", () => {
    let app;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.post(
        "/test",
        [body("amount").isFloat({ min: 1 }).withMessage("Invalid amount")],
        (req, res) => {
          const errors = validationResult(req);
          res.json({ valid: errors.isEmpty() });
        },
      );
    });

    it("should accept positive amounts", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ amount: 100 });
      expect(response.body.valid).toBe(true);
    });

    it("should reject zero amount", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ amount: 0 });
      expect(response.body.valid).toBe(false);
    });

    it("should reject negative amount", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ amount: -50 });
      expect(response.body.valid).toBe(false);
    });
  });

  describe("Member type validation", () => {
    let app;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.post(
        "/test",
        [body("type").isIn(["member", "public"]).withMessage("Invalid type")],
        (req, res) => {
          const errors = validationResult(req);
          res.json({ valid: errors.isEmpty() });
        },
      );
    });

    it("should accept valid member type", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ type: "member" });
      expect(response.body.valid).toBe(true);
    });

    it("should accept public type", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ type: "public" });
      expect(response.body.valid).toBe(true);
    });

    it("should reject invalid type", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ type: "invalid" });
      expect(response.body.valid).toBe(false);
    });
  });

  describe("Transaction type validation", () => {
    let app;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.post(
        "/test",
        [
          body("type").isIn([
            "contribution",
            "repayment",
            "expense",
            "penalty",
            "disbursement",
          ]),
        ],
        (req, res) => {
          const errors = validationResult(req);
          res.json({ valid: errors.isEmpty() });
        },
      );
    });

    it("should accept valid transaction types", async () => {
      const types = [
        "contribution",
        "repayment",
        "expense",
        "penalty",
        "disbursement",
      ];
      for (const type of types) {
        const response = await require("supertest")(app)
          .post("/test")
          .send({ type });
        expect(response.body.valid).toBe(true);
      }
    });

    it("should reject invalid transaction type", async () => {
      const response = await require("supertest")(app)
        .post("/test")
        .send({ type: "invalid" });
      expect(response.body.valid).toBe(false);
    });
  });
});
