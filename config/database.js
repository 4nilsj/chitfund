const sqlite3 = require('sqlite3').verbose();
const dbPath = process.env.NODE_ENV === 'test' ? 'chitfund_test.db' : 'chitfund.db';
const dbList = new sqlite3.Database(dbPath);

const db = {
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            dbList.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    },
    all: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            dbList.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            dbList.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    init: async () => {
        const membersTable = `
            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                contact TEXT,
                type TEXT DEFAULT 'member', -- 'member' or 'public'
                status TEXT DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const loansTable = `
            CREATE TABLE IF NOT EXISTS loans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER,
                amount REAL,
                interest_rate REAL,
                tenure INTEGER,
                emi REAL,
                start_date TEXT,
                status TEXT DEFAULT 'active',
                outstanding REAL,
                FOREIGN KEY(member_id) REFERENCES members(id)
            )
        `;

        const transactionsTable = `
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id INTEGER,
                date TEXT,
                type TEXT, -- contribution, repayment, disbursement, penalty, expense
                amount REAL,
                remarks TEXT,
                receipt_path TEXT,
                payment_batch_id TEXT,
                loan_id INTEGER,
                FOREIGN KEY(member_id) REFERENCES members(id),
                FOREIGN KEY(loan_id) REFERENCES loans(id) ON DELETE CASCADE
            )
        `;

        // Settings table for PIN
        const settingsTable = `
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `;

        const usersTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password_hash TEXT,
                role TEXT -- 'admin', 'manager'
            )
        `;

        try {
            // Enable Foreign Key Enforcement
            await db.run("PRAGMA foreign_keys = ON;");

            await db.run(membersTable);
            await db.run(loansTable);
            await db.run(transactionsTable);
            await db.run(settingsTable);
            await db.run(usersTable);

            // Migration: Add columns to transactions if not exists
            try {
                await db.run("ALTER TABLE transactions ADD COLUMN receipt_path TEXT");
                console.log("Migration: Added receipt_path column.");
            } catch (e) { }

            try {
                await db.run("ALTER TABLE transactions ADD COLUMN payment_batch_id TEXT");
                console.log("Migration: Added payment_batch_id column.");
            } catch (e) { }

            try {
                await db.run("ALTER TABLE transactions ADD COLUMN loan_id INTEGER");
                console.log("Migration: Added loan_id column.");
            } catch (e) { }

            try {
                await db.run("ALTER TABLE loans ADD COLUMN interest_waived REAL DEFAULT 0");
                console.log("Migration: Added interest_waived column.");
            } catch (e) { }

            // Migration: Populate loan_id for existing records
            try {
                const regex = /Loan:(\d+)/;
                const txns = await db.all("SELECT id, remarks FROM transactions WHERE loan_id IS NULL AND remarks LIKE '%Loan:%'");
                for (const txn of txns) {
                    const match = txn.remarks.match(regex);
                    if (match && match[1]) {
                        await db.run("UPDATE transactions SET loan_id = ? WHERE id = ?", [match[1], txn.id]);
                    }
                }
                console.log(`Migration: Populated loan_id for ${txns.length} records.`);
            } catch (e) {
                console.error("Migration Error (populate loan_id):", e);
            }

            // Migration: Populate outstanding for old loans if missing
            try {
                const loans = await db.all("SELECT * FROM loans WHERE outstanding IS NULL");
                for (const loan of loans) {
                    const totalInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;
                    const totalPayable = loan.amount + totalInterest;
                    const emi = Math.round(totalPayable / loan.tenure);
                    const totalEMI = emi * loan.tenure;

                    const repaidRes = await db.get("SELECT SUM(amount) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'", [loan.id]);
                    const totalRepaid = repaidRes.total || 0;
                    const waived = loan.interest_waived || 0;
                    const newOutstanding = Math.max(0, totalEMI - waived - totalRepaid);

                    await db.run("UPDATE loans SET outstanding = ? WHERE id = ?", [newOutstanding, loan.id]);
                }
                if (loans.length > 0) {
                    console.log(`Migration: Populated outstanding balances for ${loans.length} old loans.`);
                }
            } catch (e) {
                console.error("Migration Error (populate outstanding):", e);
            }

            // Seed Users
            const admin = await db.get("SELECT id FROM users WHERE username = 'admin'");
            if (!admin) {
                const bcrypt = require('bcrypt');
                const adminHash = await bcrypt.hash('admin123', 10);
                const managerHash = await bcrypt.hash('manager123', 10);

                await db.run("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)", ['admin', adminHash, 'admin']);
                await db.run("INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)", ['manager', managerHash, 'manager']);
                console.log("Default users created.");
            }

            console.log("Database tables initialized.");

            // Migration: Create audit_logs table
            await db.run(`
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    action TEXT,
                    details TEXT,
                    ip_address TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Migration: Add UNIQUE index for contributions to prevent duplicates
            try {
                await db.run(`
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_contribution 
                    ON transactions(member_id, payment_batch_id) 
                    WHERE type = 'contribution'
                `);
                console.log("Migration: Added unique index for contributions.");
            } catch (e) {
                console.error("Migration Error (unique index):", e.message);
            }
        } catch (err) {
            console.error("Error initializing database:", err);
        }
    }
};

// db.init(); // Removed auto-init for testing control

module.exports = db;
