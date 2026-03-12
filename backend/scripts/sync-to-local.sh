#!/bin/bash

# sync-to-local.sh (v1.1.6)
# Clones Supabase database to local dashboard_dev

# Load current .env.dev
if [ -f .env.dev ]; then
    export $(grep -v '^#' .env.dev | xargs)
fi

echo "--- Supabase to Local Sync Tool ---"

# Step 1: Get Remote URL
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env.dev"
    echo "Please add your Supabase URI (postgresql://...) to .env.dev first."
    exit 1
fi

# Step 2: Confirm Local Target
DB_NAME=${DB_NAME:-dashboard_dev}
DB_USER=${DB_USER:-dashboard_user}

echo "Source:  Supabase (Cloud)"
echo "Target:  Local Database ($DB_NAME)"
echo "-----------------------------------"

read -p "⚠️  This will overwrite local data in '$DB_NAME'. Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Canceled."
    exit 1
fi

echo "1/2 📥 Dumping remote schema & data..."
# Note: Using --no-owner and --no-privileges to avoid local permission issues
pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists -f supabase_dump.sql

if [ $? -eq 0 ]; then
    echo "2/2 📤 Restoring to local database..."
    psql -U "$DB_USER" -d "$DB_NAME" -f supabase_dump.sql > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ Sync complete! Local data is now up to date."
        rm supabase_dump.sql
    else
        echo "❌ Restore failed. Check if local postgres is running and user exists."
    fi
else
    echo "❌ Dump failed. Check your DATABASE_URL and internet connection."
fi
