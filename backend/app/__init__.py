from flask import Flask, request, jsonify, send_from_directory
from app.config import config_by_name
from app.extensions import db, migrate, jwt, cors
from flask_jwt_extended import create_access_token
from pathlib import Path
import os


def create_app(config_name='development'):
    """Flask application factory"""
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
    
    # Import models for Flask-Migrate to discover them
    from app.models import (
        User, KiteConfig, Strategy, UserStrategy, TradingSession,
        LiveOrder, PaperOrder, PaperPosition, VirtualAccount, AuditLog, Instrument
    )

    from app.routes import register_routes
    register_routes(app)

    # Start background scheduler (skip in testing to avoid conflicts)
    if not app.config.get('TESTING'):
        from app.services.scheduler import create_scheduler
        create_scheduler(app)

    # Expose SessionManager as app.session_manager
    from app.services.session_manager import session_manager
    session_manager.init_app(app)
    
    # API routes - register these BEFORE the catch-all route
    @app.route('/api/health')
    def health_check():
        return {'status': 'ok', 'message': 'AlgoTrader Backend is running'}, 200
    
    # Serve React frontend for homepage
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        """Serve React app homepage"""
        # Don't serve admin routes on this port
        if path.startswith('admin'):
            return 'Admin routes are on port 8000', 404
        
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
