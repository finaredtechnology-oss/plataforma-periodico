#!/bin/sh

echo "Running PostgreSQL database connectivity and integrity checks..."
python validate_db.py

if [ $? -eq 0 ]; then
    echo "Validation successful. Collecting Django static files..."
    python manage.py collectstatic --noinput
    echo "Executing command..."
    exec "$@"
else
    echo "Validation failed. Startup aborted."
    exit 1
fi
