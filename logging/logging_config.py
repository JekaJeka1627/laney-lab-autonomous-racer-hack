import logging
import watchtower
import boto3
import socket
import datetime

# Configure root logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Avoid duplicate handlers
if not logger.handlers:

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)

    cloudwatch_handler = watchtower.CloudWatchLogHandler(
        boto3_session = boto3.Session(),
        log_group = "deepracer-logs",
        stream_name = f"{socket.gethostname()}-{datetime.datetime.now().strftime('%Y-%m-%d')}"
    )
    cloudwatch_handler.setLevel(logging.INFO)

    formatter = logging.Formatter(
    '{"time": "%(asctime)s", "logger": "%(name)s", "level": "%(levelname)s", "message": "%(message)s"}'
    )

    console_handler.setFormatter(formatter)
    cloudwatch_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(cloudwatch_handler)


def get_logger(name):
    return logging.getLogger(name)
