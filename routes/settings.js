const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { isAdmin } = require("../middleware/auth");
const path = require("path");
const { logAudit } = require("../utils/helpers");

// Protect all settings routes
router.use(isAdmin);

// GET Settings Page
router.get("/", async (req, res) => {
  try {
    // Fetch default contribution
    const defaultRaw = await db.get(
      "SELECT value FROM settings WHERE key = 'default_contribution'",
    );
    const defaultContribution = defaultRaw ? parseInt(defaultRaw.value) : 1000;

    // Fetch all overrides
    const overridesRaw = await db.all(
      "SELECT key, value FROM settings WHERE key LIKE 'contribution_%'",
    );
    const overrides = overridesRaw
      .map((row) => ({
        month: row.key.replace("contribution_", ""),
        amount: parseInt(row.value),
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    // Fetch opening balance
    const openingRaw = await db.get(
      "SELECT value FROM settings WHERE key = 'opening_balance'",
    );
    const openingBalance = openingRaw ? parseInt(openingRaw.value) : 0;
    const isOpeningBalanceSet = !!openingRaw;

    // Fetch penalty grace day and penalty amount
    const graceDayRaw = await db.get(
      "SELECT value FROM settings WHERE key = 'penalty_grace_day'",
    );
    const penaltyGraceDay = graceDayRaw ? parseInt(graceDayRaw.value) : 10;

    const penaltyAmountRaw = await db.get(
      "SELECT value FROM settings WHERE key = 'penalty_amount'",
    );
    const penaltyAmount = penaltyAmountRaw
      ? parseFloat(penaltyAmountRaw.value)
      : 100.0;

    res.render("settings", {
      user: req.session.user,
      fundName: res.locals.fundName,
      activePage: "settings",
      defaultContribution,
      overrides,
      openingBalance,
      isOpeningBalanceSet,
      penaltyGraceDay,
      penaltyAmount,
      msg: req.query.msg,
      type: req.query.type,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading settings");
  }
});

// Update Default
router.post("/contribution/default", async (req, res) => {
  const { amount } = req.body;
  try {
    const currentRaw = await db.get(
      "SELECT value FROM settings WHERE key = 'default_contribution'",
    );
    const before = {
      default_contribution: currentRaw ? parseInt(currentRaw.value) : null,
    };
    const after = { default_contribution: parseInt(amount) };

    const exists = await db.get(
      "SELECT key FROM settings WHERE key = 'default_contribution'",
    );
    if (exists) {
      await db.run(
        "UPDATE settings SET value = ? WHERE key = 'default_contribution'",
        [amount],
      );
    } else {
      await db.run(
        "INSERT INTO settings (key, value) VALUES ('default_contribution', ?)",
        [amount],
      );
    }
    await logAudit(req, "UPDATE_DEFAULT_CONTRIBUTION", { before, after });
    res.redirect("/settings?msg=Global default updated successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating default");
  }
});

// Add/Update Override
router.post("/contribution/override", async (req, res) => {
  const { month, amount } = req.body;
  const key = `contribution_${month}`;
  try {
    const currentRaw = await db.get(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    const before = currentRaw ? { amount: parseInt(currentRaw.value) } : null;
    const after = { amount: parseInt(amount) };

    const exists = await db.get("SELECT key FROM settings WHERE key = ?", [
      key,
    ]);
    if (exists) {
      await db.run("UPDATE settings SET value = ? WHERE key = ?", [
        amount,
        key,
      ]);
    } else {
      await db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [
        key,
        amount,
      ]);
    }
    await logAudit(
      req,
      before ? "UPDATE_CONTRIBUTION_OVERRIDE" : "ADD_CONTRIBUTION_OVERRIDE",
      {
        month,
        before,
        after,
      },
    );
    res.redirect("/settings?msg=Monthly override set successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error setting override");
  }
});

// Delete Override
router.post("/contribution/delete", async (req, res) => {
  const { month } = req.body;
  const key = `contribution_${month}`;
  try {
    const currentRaw = await db.get(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    const before = currentRaw ? { amount: parseInt(currentRaw.value) } : null;

    await db.run("DELETE FROM settings WHERE key = ?", [key]);
    await logAudit(req, "DELETE_CONTRIBUTION_OVERRIDE", {
      month,
      before,
      after: null,
    });
    res.redirect("/settings?msg=Override removed.&type=warning");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error removing override");
  }
});

// Update Fund Name
router.post("/update-fund-name", async (req, res) => {
  const { fund_name } = req.body;
  try {
    const key = "fund_name";
    const currentRaw = await db.get(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    const before = { fund_name: currentRaw ? currentRaw.value : null };
    const after = { fund_name };

    const exists = await db.get("SELECT key FROM settings WHERE key = ?", [
      key,
    ]);
    if (exists) {
      await db.run("UPDATE settings SET value = ? WHERE key = ?", [
        fund_name,
        key,
      ]);
    } else {
      await db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [
        key,
        fund_name,
      ]);
    }
    await logAudit(req, "UPDATE_FUND_NAME", { before, after });
    res.redirect("/settings?msg=Fund name updated successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating fund name");
  }
});

// Set Opening Balance
router.post("/opening-balance", async (req, res) => {
  const { amount } = req.body;
  try {
    const key = "opening_balance";
    const currentRaw = await db.get(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    const before = currentRaw
      ? { opening_balance: parseFloat(currentRaw.value) }
      : null;
    const after = { opening_balance: parseFloat(amount) };

    const exists = await db.get("SELECT value FROM settings WHERE key = ?", [
      key,
    ]);

    if (exists) {
      // Usually this is one-time, but for flexibility we might allow update or check a flag
      // The UI says "You cannot change this later", so maybe we should block it?
      // For now, let's allow it to fix mistakes, or strictly follow logic.
      // Let's UPDATE it to be safe.
      await db.run("UPDATE settings SET value = ? WHERE key = ?", [
        amount,
        key,
      ]);
    } else {
      await db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [
        key,
        amount,
      ]);
    }
    await logAudit(req, "UPDATE_OPENING_BALANCE", { before, after });
    res.redirect("/?msg=Opening balance set successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error setting opening balance");
  }
});

// Download Database Backup
router.get("/backup", (req, res) => {
  try {
    const dbPath = path.resolve(__dirname, "../chitfund.db");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `chitfund_backup_${timestamp}.db`;

    res.download(dbPath, filename, (err) => {
      if (err) {
        console.error("Backup download error:", err);
        // Can't send 500 if headers already sent, but usually download handles it
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating backup");
  }
});

// GET Audit Logs
router.get("/audit-logs", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 25;
    const offset = (page - 1) * limit;

    const countRes = await db.get("SELECT COUNT(*) as total FROM audit_logs");
    const totalItems = countRes.total || 0;
    const totalPages = Math.ceil(totalItems / limit);

    const logs = await db.all(
      `
            SELECT a.*, u.username 
            FROM audit_logs a
            LEFT JOIN users u ON a.user_id = u.id
            ORDER BY a.timestamp DESC
            LIMIT ? OFFSET ?
        `,
      [limit, offset],
    );

    res.render("audit_logs", {
      user: req.session.user,
      fundName: res.locals.fundName,
      activePage: "settings",
      logs,
      pagination: {
        baseUrl: "/settings/audit-logs",
        currentPage: page,
        totalPages,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading audit logs");
  }
});

// Update Penalty Rules
router.post("/penalty-rules", async (req, res) => {
  const { penalty_amount, penalty_grace_day } = req.body;
  try {
    const currentAmountRaw = await db.get(
      "SELECT value FROM settings WHERE key = 'penalty_amount'",
    );
    const currentGraceDayRaw = await db.get(
      "SELECT value FROM settings WHERE key = 'penalty_grace_day'",
    );

    const before = {
      penalty_amount: currentAmountRaw
        ? parseFloat(currentAmountRaw.value)
        : null,
      penalty_grace_day: currentGraceDayRaw
        ? parseInt(currentGraceDayRaw.value)
        : null,
    };

    const after = {
      penalty_amount: parseFloat(penalty_amount),
      penalty_grace_day: parseInt(penalty_grace_day),
    };

    // 1. Update penalty amount
    const hasAmount = await db.get(
      "SELECT key FROM settings WHERE key = 'penalty_amount'",
    );
    if (hasAmount) {
      await db.run(
        "UPDATE settings SET value = ? WHERE key = 'penalty_amount'",
        [penalty_amount],
      );
    } else {
      await db.run(
        "INSERT INTO settings (key, value) VALUES ('penalty_amount', ?)",
        [penalty_amount],
      );
    }

    // 2. Update penalty grace day
    const hasGraceDay = await db.get(
      "SELECT key FROM settings WHERE key = 'penalty_grace_day'",
    );
    if (hasGraceDay) {
      await db.run(
        "UPDATE settings SET value = ? WHERE key = 'penalty_grace_day'",
        [penalty_grace_day],
      );
    } else {
      await db.run(
        "INSERT INTO settings (key, value) VALUES ('penalty_grace_day', ?)",
        [penalty_grace_day],
      );
    }

    await logAudit(req, "UPDATE_PENALTY_RULES", { before, after });
    res.redirect("/settings?msg=Penalty rules updated successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating penalty rules");
  }
});

// Run Manual Penalty Check
router.post("/penalty-run", async (req, res) => {
  try {
    const penaltyService = require("../services/penaltyService");
    const currentMonth = new Date().toISOString().slice(0, 7);
    const count = await penaltyService.assessLatePenalties(currentMonth);
    res.redirect(
      `/settings?msg=Manual penalty check complete. Assessed ${count} penalties.`,
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error running penalty check");
  }
});

module.exports = router;
