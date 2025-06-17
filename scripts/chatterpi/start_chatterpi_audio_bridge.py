#!/usr/bin/env python3
"""
Startup script for ChatterPi Audio Bridge
Launches the audio bridge server with proper configuration
"""

import sys
import os
import argparse
import logging
import asyncio

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from chatterpi_audio_bridge import ChatterPiAudioBridge

def setup_logging(debug=False):
    """Setup logging configuration"""
    log_level = logging.DEBUG if debug else logging.INFO
    
    # Configure logging format
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler('/tmp/chatterpi_audio_bridge.log', mode='a')
        ]
    )
    
    # Reduce noise from some libraries
    logging.getLogger('websockets').setLevel(logging.WARNING)
    logging.getLogger('asyncio').setLevel(logging.WARNING)

async def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description="ChatterPi Audio Bridge - WebSocket server for animatronic control",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                          # Start on localhost:8767
  %(prog)s --host 0.0.0.0           # Listen on all interfaces
  %(prog)s --port 8768              # Use custom port
  %(prog)s --debug                  # Enable debug logging
        """
    )
    
    parser.add_argument(
        '--host', 
        default='localhost',
        help='Server host address (default: localhost)'
    )
    
    parser.add_argument(
        '--port', 
        type=int, 
        default=8767,
        help='Server port (default: 8767)'
    )
    
    parser.add_argument(
        '--debug', 
        action='store_true',
        help='Enable debug logging'
    )
    
    parser.add_argument(
        '--log-file',
        default='/tmp/chatterpi_audio_bridge.log',
        help='Log file path (default: /tmp/chatterpi_audio_bridge.log)'
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.debug)
    logger = logging.getLogger(__name__)
    
    logger.info("=" * 60)
    logger.info("🎭 ChatterPi Audio Bridge Starting")
    logger.info("=" * 60)
    logger.info(f"Host: {args.host}")
    logger.info(f"Port: {args.port}")
    logger.info(f"Debug: {args.debug}")
    logger.info(f"Log file: {args.log_file}")
    logger.info("=" * 60)
    
    # Create and start the audio bridge
    bridge = ChatterPiAudioBridge(args.host, args.port)
    
    try:
        logger.info("🚀 Starting ChatterPi Audio Bridge server...")
        await bridge.start_server()
        
    except KeyboardInterrupt:
        logger.info("⚠️ Received interrupt signal")
        
    except Exception as e:
        logger.error(f"❌ Server error: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        
    finally:
        logger.info("🧹 Cleaning up...")
        try:
            await bridge.cleanup()
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
        
        logger.info("✅ ChatterPi Audio Bridge shutdown complete")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n⚠️ Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        sys.exit(1)
