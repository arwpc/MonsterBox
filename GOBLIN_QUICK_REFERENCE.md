# 🎃 Goblin Quick Reference Card

## Quick Commands

### Service Management
```bash
# Check status
sudo systemctl status goblin

# Start
sudo systemctl start goblin

# Stop
sudo systemctl stop goblin

# Restart
sudo systemctl restart goblin

# Enable auto-start
sudo systemctl enable goblin

# Disable auto-start
sudo systemctl disable goblin
```

### Logs
```bash
# Live application logs
tail -f ~/goblin/logs/goblin.log

# Live system logs
sudo journalctl -u goblin -f

# Last 50 lines
sudo journalctl -u goblin -n 50

# Errors only
sudo journalctl -u goblin -p err
```

### Testing
```bash
# Check if goblin is responding
curl http://localhost:3001/api/status

# Play a test video
curl -X POST http://localhost:3001/api/play \
  -H "Content-Type: application/json" \
  -d '{"videoId": "video/test.mp4", "loop": true, "volume": 80}'

# Stop video
curl -X POST http://localhost:3001/api/stop
```

### Deployment
```bash
# Deploy/redeploy goblin
cd ~/MonsterBox/goblin-system
./deploy-production.sh

# Verify production readiness
./verify-production.sh
```

## Network Configuration

| Device | IP | Port | URL |
|--------|-----|------|-----|
| MonsterBox | 192.168.8.200 | 3100 | http://192.168.8.200:3100 |
| goblin1 | 192.168.8.160 | 3001 | http://192.168.8.160:3001 |
| goblin2 | 192.168.8.161 | 3001 | http://192.168.8.161:3001 |

## File Locations

```
~/goblin/
├── server.js              # Main server
├── mediaPlayer.js         # Video player
├── beacon.js              # Auto-discovery
├── config/
│   └── goblin.json       # Configuration
├── media/
│   ├── video/            # Video files
│   └── audio/            # Audio files
├── logs/
│   ├── goblin.log        # Application log
│   └── goblin-error.log  # Error log
└── node_modules/         # Dependencies
```

## Troubleshooting

### Goblin won't start
```bash
# Check logs
sudo journalctl -u goblin -n 50

# Check if port is in use
sudo netstat -tulpn | grep 3001

# Kill any existing process
pkill -f "node.*goblin"

# Restart
sudo systemctl restart goblin
```

### Can't connect to MonsterBox
```bash
# Check network
ping 192.168.8.200

# Check MonsterBox is running
curl http://192.168.8.200:3100/api/system/info

# Check goblin logs for beacon
tail -f ~/goblin/logs/goblin.log | grep beacon
```

### Video won't play
```bash
# Check video file exists
ls -lh ~/goblin/media/video/

# Test mpv directly
mpv ~/goblin/media/video/test.mp4

# Check logs
tail -f ~/goblin/logs/goblin.log
```

### No audio
```bash
# Set audio to HDMI
amixer cset numid=3 2

# Set audio to headphone jack
amixer cset numid=3 1

# Test audio
speaker-test -t wav -c 2
```

## API Endpoints

### Status
```bash
GET http://localhost:3001/api/status
```

### Play Video
```bash
POST http://localhost:3001/api/play
Content-Type: application/json

{
  "videoId": "video/test.mp4",
  "loop": true,
  "volume": 80
}
```

### Stop Video
```bash
POST http://localhost:3001/api/stop
```

### List Videos
```bash
GET http://localhost:3001/api/videos
```

### Health Check
```bash
GET http://localhost:3001/health
```

## Scene Testing from MonsterBox

### Test Scene ID: 16
"Dual Goblin Video Test - Production Ready"

```bash
# From MonsterBox
curl -X POST http://127.0.0.1:3100/scenes/api/16/play

# Or from browser
http://192.168.8.200:3100/scenes
```

## Production Checklist

Before going live:

- [ ] Service is enabled: `systemctl is-enabled goblin`
- [ ] Service is running: `systemctl is-active goblin`
- [ ] Responds to HTTP: `curl http://localhost:3001/api/status`
- [ ] Videos are accessible: `ls ~/goblin/media/video/`
- [ ] Logs are working: `tail ~/goblin/logs/goblin.log`
- [ ] Auto-start tested: Reboot and verify
- [ ] Registered with MonsterBox: Check MonsterBox UI
- [ ] Test scene works: Run scene 16

## Emergency Commands

### Complete Reset
```bash
# Stop service
sudo systemctl stop goblin

# Remove everything
rm -rf ~/goblin

# Redeploy
cd ~/MonsterBox/goblin-system
./deploy-production.sh
```

### Force Kill
```bash
# Kill all goblin processes
sudo pkill -9 -f "node.*goblin"

# Restart service
sudo systemctl restart goblin
```

### View All Processes
```bash
# Find goblin processes
ps aux | grep goblin

# Find processes on port 3001
sudo lsof -i :3001
```

## Performance Monitoring

```bash
# CPU and memory usage
top -p $(pgrep -f "node.*goblin")

# Disk usage
df -h ~/goblin

# Network connections
sudo netstat -anp | grep 3001
```

## Backup Configuration

```bash
# Backup config
cp ~/goblin/config/goblin.json ~/goblin-config-backup.json

# Restore config
cp ~/goblin-config-backup.json ~/goblin/config/goblin.json
sudo systemctl restart goblin
```

## Update Goblin

```bash
# Pull latest code
cd ~/MonsterBox
git pull

# Redeploy
cd goblin-system
./deploy-production.sh
```

---

**Quick Help:** For detailed information, see `GOBLIN_PRODUCTION_GUIDE.md`

