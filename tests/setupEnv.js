const db = require("../config/database");
const bcrypt = require("bcrypt");

beforeAll(async () => {
  try {
    await db.init();
    const adminHash = bcrypt.hashSync("admin123", 10);
    const managerHash = bcrypt.hashSync("manager123", 10);

    await db.run("DELETE FROM users WHERE username IN ('admin', 'manager')");
    await db.run(
      "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('admin', ?, 'admin')",
      [adminHash],
    );
    await db.run(
      "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES ('manager', ?, 'manager')",
      [managerHash],
    );
  } catch (e) {
    // Ignored
  }
});

afterAll(async () => {
  try {
    await db.close();
  } catch (e) {
    // Ignored
  }
});
