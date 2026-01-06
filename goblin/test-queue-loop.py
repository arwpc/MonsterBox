#!/usr/bin/env python3
"""
Queue Loop Test Script for Goblin Three
Tests queue system with:
- Each video repeated 5 times
- Entire queue looping for 3 minutes
"""

import requests
import json
import time
from datetime import datetime, timedelta

GOBLIN_URL = "http://192.168.8.14:3001"
TEST_DURATION_SECONDS = 180  # 3 minutes
VIDEO_REPEAT_COUNT = 5

def print_status(message):
    """Print timestamped status message"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] {message}")

def get_queue_status():
    """Get current queue status"""
    try:
        response = requests.get(f"{GOBLIN_URL}/queue", timeout=5)
        if response.status_code == 200:
            return response.json()['queue']
        return None
    except Exception as e:
        print_status(f"❌ Error getting queue status: {e}")
        return None

def start_queue(videos, mode="loop"):
    """Start the video queue"""
    try:
        response = requests.post(
            f"{GOBLIN_URL}/queue/start",
            json={"videos": videos, "mode": mode},
            timeout=5
        )
        if response.status_code == 200:
            return response.json()
        else:
            print_status(f"❌ Failed to start queue: {response.text}")
            return None
    except Exception as e:
        print_status(f"❌ Error starting queue: {e}")
        return None

def stop_queue():
    """Stop the video queue"""
    try:
        response = requests.post(f"{GOBLIN_URL}/queue/stop", timeout=5)
        if response.status_code == 200:
            return response.json()
        return None
    except Exception as e:
        print_status(f"❌ Error stopping queue: {e}")
        return None

def main():
    print("=" * 70)
    print("GOBLIN THREE QUEUE LOOP TEST")
    print("=" * 70)
    print(f"Configuration:")
    print(f"  - Each video will be repeated: {VIDEO_REPEAT_COUNT} times")
    print(f"  - Queue will loop for: {TEST_DURATION_SECONDS} seconds (3 minutes)")
    print(f"  - Goblin URL: {GOBLIN_URL}")
    print("=" * 70)
    print()

    # Base videos to use
    base_videos = [
        "test.mp4",
        "scary-loop-5.mp4"
    ]

    # Create queue with each video repeated 5 times
    queue_videos = []
    for video in base_videos:
        for i in range(VIDEO_REPEAT_COUNT):
            queue_videos.append(video)
    
    print_status(f"📋 Created queue with {len(queue_videos)} videos:")
    for i, video in enumerate(queue_videos, 1):
        print(f"     {i}. {video}")
    print()

    # Start the queue in loop mode
    print_status("🚀 Starting queue in LOOP mode...")
    result = start_queue(queue_videos, mode="loop")
    
    if not result or not result.get('success'):
        print_status("❌ Failed to start queue!")
        return
    
    print_status("✅ Queue started successfully!")
    print()

    # Monitor the queue for 3 minutes
    start_time = datetime.now()
    end_time = start_time + timedelta(seconds=TEST_DURATION_SECONDS)
    
    print_status(f"⏱️  Monitoring queue until {end_time.strftime('%H:%M:%S')}")
    print_status(f"   (Running for {TEST_DURATION_SECONDS} seconds)")
    print()

    video_play_count = {}
    last_video = None
    check_interval = 2  # Check every 2 seconds
    
    while datetime.now() < end_time:
        status = get_queue_status()
        
        if status:
            current_video = status.get('currentVideo')
            
            # Track video plays
            if current_video and current_video != last_video:
                video_play_count[current_video] = video_play_count.get(current_video, 0) + 1
                print_status(f"🎬 Now playing: {current_video} (play #{video_play_count[current_video]})")
                last_video = current_video
            
            # Show periodic status
            remaining = (end_time - datetime.now()).total_seconds()
            if int(remaining) % 30 == 0:  # Every 30 seconds
                print_status(f"📊 Status: Running={status['running']}, "
                           f"Current={current_video}, "
                           f"Queue Length={status['queueLength']}, "
                           f"Remaining={int(remaining)}s")
        
        time.sleep(check_interval)
    
    print()
    print_status("⏰ 3 minutes elapsed - stopping queue...")
    
    # Stop the queue
    stop_result = stop_queue()
    if stop_result:
        print_status("✅ Queue stopped successfully!")
    else:
        print_status("⚠️  Queue stop command sent (may have already finished)")
    
    # Wait a moment for queue to fully stop
    time.sleep(2)
    
    # Final status check
    final_status = get_queue_status()
    
    print()
    print("=" * 70)
    print("TEST RESULTS")
    print("=" * 70)
    print(f"Duration: {TEST_DURATION_SECONDS} seconds (3 minutes)")
    print(f"Videos in queue: {len(queue_videos)} (each base video repeated {VIDEO_REPEAT_COUNT}x)")
    print()
    print("Video Play Counts:")
    for video, count in sorted(video_play_count.items()):
        print(f"  {video}: {count} plays")
    print()
    
    if final_status:
        print("Final Queue Status:")
        print(f"  Running: {final_status['running']}")
        print(f"  Mode: {final_status['mode']}")
        print(f"  Current Video: {final_status['currentVideo']}")
        print(f"  Queue Length: {final_status['queueLength']}")
    
    print()
    print("=" * 70)
    print("✅ TEST COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    main()

