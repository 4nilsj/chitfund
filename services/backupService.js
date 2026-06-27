const fs = require("fs");
const path = require("path");
const cron = require("node-cron");
const zlib = require("zlib");

const DB_PATH = path.join(__dirname, "../chitfund.db");
const BACKUP_DIR = path.join(__dirname, "../backups");

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const cleanOldBackups = () => {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter(
        (f) =>
          f.startsWith("chitfund_") &&
          (f.endsWith(".db.gz") || f.endsWith(".db")),
      )
      .map((f) => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    if (files.length > 30) {
      const filesToDelete = files.slice(30);
      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        console.log(`[Backup] Deleted old backup: ${file.name}`);
      }
    }
  } catch (err) {
    console.error("[Backup] Error cleaning old backups:", err);
  }
};

const backupDatabase = () => {
  return new Promise((resolve) => {
    try {
      const timestamp = new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\..+/, "");
      const backupPath = path.join(BACKUP_DIR, `chitfund_${timestamp}.db.gz`);

      const readStream = fs.createReadStream(DB_PATH);
      const gzip = zlib.createGzip();
      const writeStream = fs.createWriteStream(backupPath);

      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on("finish", () => {
          console.log(
            `[Backup] Database backed up and compressed successfully to: ${backupPath}`,
          );
          cleanOldBackups();
          resolve(backupPath);
        })
        .on("error", (err) => {
          console.error("[Backup] Error compressing database backup:", err);
          resolve(null);
        });
    } catch (err) {
      console.error("[Backup] Error creating compressed backup:", err);
      resolve(null);
    }
  });
};

const initBackupSchedule = () => {
  // Schedule backup daily at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    console.log("[Backup] Starting scheduled backup...");
    await backupDatabase();
  });
  console.log("[Backup] Backup scheduler initialized (Daily at 00:00)");
};

module.exports = {
  backupDatabase,
  initBackupSchedule,
};
