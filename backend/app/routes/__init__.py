from app.routes.auth import auth_bp
from app.routes.admin.users import admin_users_bp
from app.routes.admin.strategies import admin_strategies_bp
from app.routes.admin.candle_patterns import admin_candle_patterns_bp
from app.routes.admin.kite import admin_kite_bp
from app.routes.admin.sessions import admin_sessions_bp
from app.routes.admin.orders import admin_orders_bp
from app.routes.admin.backtest import admin_backtest_bp
from app.routes.customer.dashboard import customer_dashboard_bp
from app.routes.customer.strategies import customer_strategies_bp
from app.routes.customer.session import customer_session_bp
from app.routes.customer.orders import customer_orders_bp
from app.routes.customer.positions import customer_positions_bp
from app.routes.customer.kite import customer_kite_bp
from app.routes.customer.market import customer_market_bp
from app.routes.customer.backtest import customer_backtest_bp


def register_routes(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_users_bp)
    app.register_blueprint(admin_strategies_bp)
    app.register_blueprint(admin_candle_patterns_bp)
    app.register_blueprint(admin_kite_bp)
    app.register_blueprint(admin_sessions_bp)
    app.register_blueprint(admin_orders_bp)
    app.register_blueprint(admin_backtest_bp)
    app.register_blueprint(customer_dashboard_bp)
    app.register_blueprint(customer_strategies_bp)
    app.register_blueprint(customer_session_bp)
    app.register_blueprint(customer_orders_bp)
    app.register_blueprint(customer_positions_bp)
    app.register_blueprint(customer_kite_bp)
    app.register_blueprint(customer_market_bp)
    app.register_blueprint(customer_backtest_bp)
