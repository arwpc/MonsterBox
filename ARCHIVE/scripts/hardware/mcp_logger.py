#!/usr/bin/env python3
"""
MCP Logger for MonsterBox Hardware Services
Provides structured logging for MCP (Model Context Protocol) log collection and analysis
"""

import json
import logging
import time
import os
from datetime import datetime
from typing import Dict, Any, Optional
from pathlib import Path

class MCPLogger:
    """MCP-compliant logger for hardware services"""
    
    def __init__(self, service_name: str, log_dir: str = "/tmp"):
        self.service_name = service_name
        self.log_dir = Path(log_dir)
        self.log_file = self.log_dir / f"{service_name}_mcp.log"
        
        # Ensure log directory exists
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize logging
        self.logger = logging.getLogger(f"mcp_{service_name}")
        self.logger.setLevel(logging.DEBUG)
        
        # Create file handler if not exists
        if not self.logger.handlers:
            handler = logging.FileHandler(self.log_file)
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
    
    def _create_log_entry(self, level: str, event_type: str, data: Dict[str, Any], 
                         error: Optional[str] = None) -> Dict[str, Any]:
        """Create standardized MCP log entry"""
        entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": self.service_name,
            "level": level.upper(),
            "event_type": event_type,
            "data": data,
            "process_id": os.getpid(),
            "thread_id": None,  # Could add threading.get_ident() if needed
        }
        
        if error:
            entry["error"] = error
        
        return entry
    
    def log_info(self, event_type: str, data: Dict[str, Any]):
        """Log info level event"""
        entry = self._create_log_entry("INFO", event_type, data)
        self.logger.info(json.dumps(entry))
    
    def log_warning(self, event_type: str, data: Dict[str, Any]):
        """Log warning level event"""
        entry = self._create_log_entry("WARNING", event_type, data)
        self.logger.warning(json.dumps(entry))
    
    def log_error(self, event_type: str, data: Dict[str, Any], error: Optional[str] = None):
        """Log error level event"""
        entry = self._create_log_entry("ERROR", event_type, data, error)
        self.logger.error(json.dumps(entry))
    
    def log_debug(self, event_type: str, data: Dict[str, Any]):
        """Log debug level event"""
        entry = self._create_log_entry("DEBUG", event_type, data)
        self.logger.debug(json.dumps(entry))
    
    def log_performance(self, operation: str, duration_ms: float, data: Dict[str, Any]):
        """Log performance metrics"""
        perf_data = {
            "operation": operation,
            "duration_ms": duration_ms,
            **data
        }
        self.log_info("performance_metric", perf_data)
    
    def log_hardware_event(self, hardware_type: str, action: str, result: bool, 
                          data: Dict[str, Any]):
        """Log hardware interaction events"""
        hw_data = {
            "hardware_type": hardware_type,
            "action": action,
            "result": "success" if result else "failure",
            **data
        }
        
        if result:
            self.log_info("hardware_event", hw_data)
        else:
            self.log_error("hardware_event", hw_data)
    
    def log_websocket_event(self, event_type: str, message_type: str, 
                           client_info: Dict[str, Any], data: Dict[str, Any]):
        """Log WebSocket communication events"""
        ws_data = {
            "event_type": event_type,
            "message_type": message_type,
            "client_info": client_info,
            **data
        }
        self.log_info("websocket_event", ws_data)
    
    def log_tracking_event(self, character_id: str, event: str, 
                          tracking_data: Dict[str, Any]):
        """Log head tracking specific events"""
        track_data = {
            "character_id": character_id,
            "tracking_event": event,
            **tracking_data
        }
        self.log_info("tracking_event", track_data)
    
    def log_configuration_change(self, config_type: str, old_config: Dict[str, Any], 
                                new_config: Dict[str, Any]):
        """Log configuration changes"""
        config_data = {
            "config_type": config_type,
            "old_config": old_config,
            "new_config": new_config,
            "changes": self._get_config_changes(old_config, new_config)
        }
        self.log_info("configuration_change", config_data)
    
    def _get_config_changes(self, old_config: Dict[str, Any], 
                           new_config: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate configuration changes"""
        changes = {}
        
        # Find added/changed keys
        for key, value in new_config.items():
            if key not in old_config:
                changes[key] = {"action": "added", "new_value": value}
            elif old_config[key] != value:
                changes[key] = {
                    "action": "changed", 
                    "old_value": old_config[key], 
                    "new_value": value
                }
        
        # Find removed keys
        for key in old_config:
            if key not in new_config:
                changes[key] = {"action": "removed", "old_value": old_config[key]}
        
        return changes
    
    def create_context_snapshot(self) -> Dict[str, Any]:
        """Create a snapshot of current system context for MCP analysis"""
        snapshot = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": self.service_name,
            "system_info": {
                "pid": os.getpid(),
                "cwd": os.getcwd(),
                "log_file": str(self.log_file)
            }
        }
        
        # Add service-specific context if available
        if hasattr(self, '_get_service_context'):
            snapshot["service_context"] = self._get_service_context()
        
        return snapshot
    
    def flush_logs(self):
        """Flush all log handlers"""
        for handler in self.logger.handlers:
            handler.flush()
    
    def close(self):
        """Close logger and cleanup"""
        self.flush_logs()
        for handler in self.logger.handlers:
            handler.close()
            self.logger.removeHandler(handler)

# Convenience function for quick MCP logging
def create_mcp_logger(service_name: str) -> MCPLogger:
    """Create and return an MCP logger instance"""
    return MCPLogger(service_name)

# Example usage and testing
if __name__ == "__main__":
    # Test the MCP logger
    logger = create_mcp_logger("test_service")
    
    # Test different log types
    logger.log_info("service_started", {"version": "1.0.0", "port": 8776})
    
    logger.log_hardware_event("servo", "move", True, {
        "servo_id": "test_servo",
        "angle": 90,
        "duration_ms": 1000
    })
    
    logger.log_tracking_event("character_1", "motion_detected", {
        "position": [50.0, 30.0],
        "confidence": 0.85,
        "frame_count": 1234
    })
    
    logger.log_performance("frame_processing", 16.7, {
        "fps": 60,
        "resolution": "640x480"
    })
    
    logger.log_error("camera_init_failed", {
        "device": "/dev/video0",
        "error_code": "ENODEV"
    }, "Camera device not found")
    
    # Create context snapshot
    snapshot = logger.create_context_snapshot()
    print("Context snapshot:", json.dumps(snapshot, indent=2))
    
    logger.close()
    print(f"Test logs written to: {logger.log_file}")
