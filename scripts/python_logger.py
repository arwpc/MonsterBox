import logging
from logging.handlers import TimedRotatingFileHandler
import os
from datetime import datetime

log_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'log')
os.makedirs(log_dir, exist_ok=True)

def get_logger(name):
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    file_handler = TimedRotatingFileHandler(
        filename=os.path.join(log_dir, 'MonsterBox.log'),
        when='midnight',
        interval=1,
        backupCount=14,
        encoding='utf-8'
    )
    file_handler.suffix = "%Y-%m-%d"

    formatter = logging.Formatter('%(asctime)s %(levelname)s: %(message)s')
    file_handler.setFormatter(formatter)

    logger.addHandler(file_handler)

    return logger