#!/usr/bin/env python
"""Run admin server on port 8000"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

from app.admin_app import create_admin_app

if __name__ == '__main__':
    app = create_admin_app('development')
    port = int(os.getenv('ADMIN_PORT', 8000))
    print(f"\n🔐 Admin Server running on http://0.0.0.0:{port}")
    print(f"   Login: http://localhost:{port}/admin/login")
    print(f"   Dashboard: http://localhost:{port}/admin\n")
    app.run(host='0.0.0.0', port=port, debug=True)
