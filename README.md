# 💰 Chit Fund Manager

A robust, modern web application for managing Chit Fund collections, loans, and member contributions. Built with **Node.js**, **Express**, and **SQLite**.

---

## 🚀 Key Features

- **Dashboard**: Real-time summary of fund balance, monthly collections, and outstanding loans.
- **Member Management**: Separate tracking for Core Members and Public Contributors.
- **Loans**: 
    - Automated EMI calculation (Flat Rate).
    - Status tracking (Paid, Due, Overdue).
    - Guarantor linking (Planned).
- **Transactions**: 
    - **Bulk Add**: Record contributions for multiple members in one go.
    - **Dup-Check**: Strict prevention of duplicate monthly payments.
    - Full ledger of all inflows and outflows.
- **Security & Safety**: 
    - **Automated Backups**: Daily midnight backups to `backups/` folder.
    - **Audit Logs**: Tracks deletions of critical records.
    - Role-based access (Admin/Manager).
    - Member Lists.
    - Loan Portfolios.
    - Monthly Activity Statements.
- **Security**: Role-based access (Admin/Manager) and session protection.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3 (with automated migrations)
- **Frontend**: EJS Templates, Vanilla CSS, FontAwesome
- **Reports**: ExcelJS
- **Testing**: Jest, Supertest

---

## 📋 Prerequisites

Before installing ChitFund Manager, ensure you have:

- **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (optional) - [Download here](https://git-scm.com/)

### Verify Installation

```bash
node --version  # Should show v14.0.0 or higher
npm --version   # Should show 6.0.0 or higher
```

---

## 📦 Installation

For detailed step-by-step instructions for Windows, Mac, Linux, and Docker, please see the **[Installation Guide](INSTALL.md)**.

### Quick Start (Docker)
If you have Docker installed, simply run:
```bash
docker-compose up -d
```
The app will be available at `http://localhost:3000`.

### Manual Installation (Brief)
1.  **Install Node.js** (v14+).
2.  **Install Dependencies**: `npm install`.
3.  **Start Server**: `node server.js`.

---

## ⚙️ Configuration

### Change Admin Password

Edit `server.js` (around line 50):

```javascript
if (username === 'admin' && password === 'admin123') {
    // Change 'admin123' to your secure password
}
```

### Customize Fund Name

1. Login as admin
2. Go to **Reports** page
3. Use "Fund Settings" to update the name
4. Name appears on sidebar and login page

### Change Port

Edit `server.js`:

```javascript
const PORT = process.env.PORT || 3000; // Change 3000 to desired port
```

Then start with:
```bash
PORT=3001 node server.js
```

---

## 🏃 Running the Application

### Development Mode
```bash
node server.js
```
The app will be available at `http://localhost:3000`.

### Default Credentials
- **Admin**: `admin` / `admin123`
- **Manager**: `manager` / `manager123`

---

## 🧪 Testing

The project includes a comprehensive test suite with **23 validation points**.

### Run Tests
```bash
npm test
```
*Note: Tests use a dedicated `chitfund_test.db` and do not affect your production data.*

---

## 📁 Project Structure

```text
├── server.js           # Main Express application & routes
├── config/
│   └── database.js     # SQLite schema & DB utility functions
├── services/
│   └── backupService.js # Automated Backup Service
├── routes/             # Express Routes (transactions, loans, etc.)
├── views/              # EJS Templates
├── public/             # Static assets (CSS, JS, Images)
├── uploads/            # Organized receipts & documents
└── chitfund.db         # Production Database
```

---

## 🚀 Production Deployment

sudo apt update
sudo apt install -y build-essential python3
npm rebuild sqlite3 --build-from-source
sudo systemctl restart chitfund

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start server.js --name chitfund

# Enable auto-restart on system reboot
pm2 startup
pm2 save

# Monitor
pm2 status
pm2 logs chitfund
pm2 restart chitfund
```

### Security Best Practices

1. **Change Default Passwords** - Update immediately
2. **Use HTTPS** - Deploy behind nginx/Apache reverse proxy
3. **Regular Backups** - Schedule automated backups (see below)
4. **Update Dependencies** - Run `npm audit` and `npm update`
5. **Firewall Rules** - Restrict access to port 3000
6. **Environment Variables** - Use `.env` for sensitive data

---

## 💾 Backup & Restore

### Automated Backups
The system automatically creates a daily backup at **00:00 Midnight** in the `backups/` directory.

### Manual Backup
You can trigger a backup at any time by copying the database:

```bash
cp chitfund.db backups/manual_backup_$(date +%Y%m%d).db
```

### Restore from Backup

```bash
# 1. Stop server
# Ctrl+C or kill process

# 2. Copy backup file
cp backups/chitfund_2026-XX-XX.db chitfund.db

# 3. Restart server
npm start
```

### Cloud Sync (Recommended)
Install **Google Drive** or **Dropbox** and sync the `backups/` folder to the cloud for off-site protection.

---

## 🔧 Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000
kill $(lsof -t -i:3000)

# Or use different port
PORT=3001 node server.js
```

### Database Locked

```bash
# Stop all Node processes
killall node

# Restart server
node server.js
```

### Module Not Found

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Cannot Access Application

1. Check server is running: `lsof -i:3000`
2. Try `http://127.0.0.1:3000` instead of `localhost`
3. Check firewall settings
4. View logs: `cat output.log`

sudo apt update
sudo apt install -y build-essential python3 make g++

npm rebuild sqlite3 --build-from-source

---

## 🔄 Updating

```bash
# 1. Backup current installation
./backup.sh

# 2. Pull latest changes (if using Git)
git pull origin main

# 3. Update dependencies
npm install

# 4. Restart
pm2 restart chitfund  # If using PM2
# OR
node server.js
```

---

## 📚 Additional Documentation

- **Backup Guide**: [BACKUP_GUIDE.md](BACKUP_GUIDE.md) - Comprehensive backup/restore instructions
- **Features**: See walkthrough for detailed feature documentation
- **Support**: Check `output.log` for error messages

---

## 📄 License
This project is for internal use. All rights reserved.

---

**Version 2.1.0** | Last Updated: January 27, 2026  
Made with ❤️ for efficient chit fund management
