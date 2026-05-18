const db = require("../config/database");

module.exports = async () => {
  try {
    await db.close();
  } catch (e) {
    console.error("Error closing database in global teardown:", e);
  }
};
