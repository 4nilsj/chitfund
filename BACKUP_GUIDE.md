# ChitFund Manager - Backup & Restore Guide

## Overview

This guide explains how to create and restore backups of your ChitFund Manager application. Regular backups ensure your data is safe and can be recovered in case of system failures or accidental data loss.

## What Gets Backed Up

Each backup includes:
- **Database** (`chitfund.db`) - All members, loans, transactions, and settings
- **Server Code** (`server.js`) - Main application logic
- **Database Configuration** (`database.js`) - Database initialization
- **Views** (`views/`) - All EJS templates for the UI
- **Public Assets** (`public/`) - CSS, JavaScript, and static files
- **Dependencies** (`package.json`, `package-lock.json`) - Node.js packages

## Creating a Backup

### Automatic Backup (Recommended)

Run this single command from the project directory:

```bash
BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)" && \
mkdir -p "backups/$BACKUP_NAME" && \
cp -r *.js *.json views public database.js chitfund.db package*.json "backups/$BACKUP_NAME/" 2>/dev/null && \
echo "✅ Backup created: backups/$BACKUP_NAME"
```

**What this does:**
1. Creates a timestamped backup folder (e.g., `backup_20260125_024633`)
2. Copies all essential files to the backup folder
3. Confirms successful backup creation

### Manual Backup

If you prefer manual control:

```bash
# 1. Create backup directory
mkdir -p backups/backup_manual_$(date +%Y%m%d)

# 2. Copy database
cp chitfund.db backups/backup_manual_$(date +%Y%m%d)/

# 3. Copy application files
cp server.js database.js package*.json backups/backup_manual_$(date +%Y%m%d)/

# 4. Copy directories
cp -r views public backups/backup_manual_$(date +%Y%m%d)/
```

## Verifying a Backup

Check the backup contents and size:

```bash
# List backup contents
ls -lh backups/backup_20260125_024633/

# Check total backup size
du -sh backups/backup_20260125_024633/
```

**Expected contents:**
- `chitfund.db` (~36 KB or larger depending on data)
- `server.js` (~43 KB)
- `database.js` (~4 KB)
- `views/` folder (10+ files)
- `public/` folder
- `package.json` and `package-lock.json`

## Restoring from a Backup

### Full Restore

To restore your entire application from a backup:

```bash
# 1. Stop the running server
kill $(lsof -t -i:3000)

# 2. Restore all files (replace BACKUP_NAME with your backup folder)
cp -r backups/BACKUP_NAME/* .

# 3. Reinstall dependencies (if needed)
npm install

# 4. Restart the server
node server.js
```

### Database-Only Restore

To restore only the database (preserving code changes):

```bash
# 1. Stop the server
kill $(lsof -t -i:3000)

# 2. Backup current database (safety measure)
cp chitfund.db chitfund.db.before_restore

# 3. Restore database from backup
cp backups/BACKUP_NAME/chitfund.db .

# 4. Restart the server
node server.js
```

## Backup Best Practices

### Frequency
- **Daily backups** - For active use with frequent transactions
- **Weekly backups** - For moderate use
- **Before major changes** - Always backup before updates or migrations

### Storage
- Keep at least **3 recent backups**
- Store backups in **multiple locations** (external drive, cloud storage)
- Test restore process periodically

### Automated Backups

Create a backup script for automation:

```bash
#!/bin/bash
# save as: backup.sh

cd /Users/anilkumarjamadar/Desktop/API\ Scanner/chitfund
BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "backups/$BACKUP_NAME"
cp -r *.js *.json views public database.js chitfund.db package*.json "backups/$BACKUP_NAME/" 2>/dev/null
echo "✅ Backup created: backups/$BACKUP_NAME"

# Optional: Keep only last 7 backups
cd backups && ls -t | tail -n +8 | xargs rm -rf
```

Make it executable:
```bash
chmod +x backup.sh
```

Run it:
```bash
./backup.sh
```

### Schedule with Cron (macOS/Linux)

To run daily backups at 2 AM:

```bash
# Edit crontab
crontab -e

# Add this line:
0 2 * * * cd /Users/anilkumarjamadar/Desktop/API\ Scanner/chitfund && ./backup.sh
```

## Backup Location

All backups are stored in:
```
/Users/anilkumarjamadar/Desktop/API Scanner/chitfund/backups/
```

Each backup folder is named with a timestamp:
- Format: `backup_YYYYMMDD_HHMMSS`
- Example: `backup_20260125_024633`

## Troubleshooting

### "Permission denied" error
```bash
# Make backup directory writable
chmod 755 backups
```

### "No such file or directory"
```bash
# Ensure you're in the project directory
cd /Users/anilkumarjamadar/Desktop/API\ Scanner/chitfund
pwd  # Should show the chitfund directory
```

### Backup is too small
- Check if database file exists: `ls -lh chitfund.db`
- Verify all folders copied: `ls -R backups/BACKUP_NAME/`

### Cannot restore - files in use
```bash
# Stop the server first
kill $(lsof -t -i:3000)

# Wait a few seconds, then restore
sleep 3
cp -r backups/BACKUP_NAME/* .
```

## Recovery Scenarios

### Scenario 1: Accidental Data Deletion
1. Stop the server
2. Restore database from most recent backup
3. Restart server
4. Verify data integrity

### Scenario 2: Code Changes Broke Application
1. Stop the server
2. Restore entire application from last working backup
3. Run `npm install` to ensure dependencies
4. Restart server

### Scenario 3: System Crash
1. Locate most recent backup
2. Copy backup to new/repaired system
3. Install Node.js if needed
4. Run `npm install`
5. Start server with `node server.js`

## Cloud Backup (Optional)

For additional safety, sync backups to cloud storage:

### Using Google Drive
```bash
# Install rclone (one-time setup)
brew install rclone

# Configure Google Drive
rclone config

# Sync backups to cloud
rclone sync backups/ gdrive:ChitFund_Backups/
```

### Using Dropbox
```bash
# Copy to Dropbox folder
cp -r backups/* ~/Dropbox/ChitFund_Backups/
```

## Support

For issues or questions about backups:
1. Check the troubleshooting section above
2. Verify backup integrity with `ls -lh` commands
3. Ensure sufficient disk space: `df -h`

---

**Last Updated:** January 25, 2026  
**Version:** 1.0
