from logging_config import get_logger

logger = get_logger(__name__)

def load_environment():
    try:
        logger.info("Loading environment...")
        # ... logic ...
    except Exception as e:
        # The cloud-side Alarm is watching for this "ERROR" string!
        logger.error(f"ERROR: Environment failed - {e}")
        raise
