"""Admin Flask App - runs on port 8000"""
from flask import Flask, request, jsonify, send_from_directory
from app.config import config_by_name
from app.extensions import db, migrate, jwt, cors
from flask_jwt_extended import create_access_token
from datetime import timedelta
import os


def create_admin_app(config_name='development'):
    """Create admin Flask application"""
    # Serve static files from frontend build directory
    static_folder = os.path.join(os.path.dirname(__file__), '../static')
    app = Flask(__name__, static_folder=static_folder, static_url_path='')
    
    # Load configuration
    app.config.from_object(config_by_name[config_name])
    
    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app)

    # Import models so Flask-Migrate can discover them
    from app.models import (
        User, AdminUser, KiteConfig, Strategy, UserStrategy, TradingSession,
        LiveOrder, PaperOrder, PaperPosition, VirtualAccount, VirtualTransaction,
        AuditLog, Instrument
    )

    # Register all API routes (admin + customer)
    from app.routes import register_routes
    register_routes(app)

    # Register custom CLI commands (e.g. `flask admin:user:create`)
    from app.commands import register_commands
    register_commands(app)
    
    # Admin Login
    @app.route('/admin/login', methods=['POST'])
    def admin_login():
        """Authenticate admin user"""
        data = request.get_json()
        if not data:
            return {'error': 'No JSON data provided'}, 400

        username = data.get('username', '').strip().lower()
        password = data.get('password', '')

        from app.models import AdminUser

        # Authenticate against the admin_users table (email = username).
        admin = AdminUser.query.filter_by(email=username).first()
        if not admin or not admin.check_password(password) or not admin.is_active:
            return {'status': 'error', 'message': 'Invalid username or password'}, 401

        # Token lifetime is configurable per admin (session timeout).
        access_token = create_access_token(
            identity=str(admin.id),
            additional_claims={'actor': 'admin'},
            expires_delta=timedelta(minutes=admin.session_timeout_minutes),
        )
        return {
            'status': 'success',
            'message': 'Login successful',
            'access_token': access_token,
            'user': {'id': admin.id, 'email': admin.email, 'role': 'admin'}
        }, 200
    
    # Serve React frontend for admin routes
    @app.route('/admin', defaults={'path': ''}, strict_slashes=False)
    @app.route('/admin/<path:path>')
    def serve_admin_frontend(path):
        """Serve React app for admin routes"""
        # Serve static files (JS, CSS, images, etc.)
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        
        # Serve index.html for all other routes (React Router will handle them)
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(app.static_folder, 'index.html')
        
        return 'Frontend not built. Run: cd frontend && npm run build', 404
    
    # Fallback for root
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        """Serve React app for all routes"""
        # Serve static files (JS, CSS, images, etc.)
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        
        # Serve index.html for all other routes (React Router will handle them)
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(app.static_folder, 'index.html')
        
        return 'Frontend not built. Run: cd frontend && npm run build', 404
    
    @app.shell_context_processor
    def make_shell_context():
        return {'db': db}
    
    return app
