#!/bin/bash
# ChitFund Manager - Backup Script
# This script creates a timestamped backup of your application

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}ChitFund Manager - Creating Backup...${NC}"

# Create backup with timestamp
BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "backups/$BACKUP_NAME"

# Copy all essential files
cp -r *.js *.json views public database.js chitfund.db package*.json "backups/$BACKUP_NAME/" 2>/dev/null

# Check if backup was successful
if [ -f "backups/$BACKUP_NAME/chitfund.db" ]; then
    BACKUP_SIZE=$(du -sh "backups/$BACKUP_NAME" | cut -f1)
    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo -e "   Location: backups/$BACKUP_NAME"
    echo -e "   Size: $BACKUP_SIZE"
    
    # Count total backups
    BACKUP_COUNT=$(ls -1 backups | wc -l | tr -d ' ')
    echo -e "   Total backups: $BACKUP_COUNT"
    
    # Optional: Keep only last 10 backups
    cd backups
    BACKUP_TO_DELETE=$(ls -t | tail -n +11)
    if [ ! -z "$BACKUP_TO_DELETE" ]; then
        echo "$BACKUP_TO_DELETE" | xargs rm -rf
        echo -e "   Cleaned up old backups (keeping last 10)"
    fi
else
    echo "❌ Backup failed! Please check permissions and try again."
    exit 1
fi
