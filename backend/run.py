import os
from pathlib import Path
from dotenv import load_dotenv
from app import create_app, db

# Load environment variables from .env file
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

config_name = os.getenv('FLASK_ENV', 'development')
app = create_app(config_name)


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('FLASK_PORT', 5000)),
        debug=os.getenv('FLASK_DEBUG', False)
    )
