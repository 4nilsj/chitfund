const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'chitfund.db');
const db = new sqlite3.Database(dbPath);

const username = 'adminuser';
const password = 'adminpass';
const role = 'admin';

bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        console.error('Error hashing password:', err);
        return;
    }

    db.run(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`, [username, hash, role], function (err) {
        if (err) {
            console.error('Error inserting user:', err);
        } else {
            console.log(`User ${username} created with role ${role} and ID ${this.lastID}`);
        }
        db.close();
    });
});
