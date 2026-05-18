const db = require("../config/database");

afterAll(async () => {
  try {
    await db.close();
  } catch (e) {
    // Ignored
  }
});
