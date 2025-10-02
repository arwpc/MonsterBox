# 🎃 Goblin Production Deployment Checklist

## Pre-Deployment Checklist

### MonsterBox Main System
- [ ] MonsterBox 5.0 Gold is running
- [ ] MonsterBox is accessible at http://192.168.8.200:3000
- [ ] Goblin Manager is initialized
- [ ] Scene system is working
- [ ] Test scene (ID: 7) is created

### Network Configuration
- [ ] goblin1 has static IP: 192.168.8.160
- [ ] goblin2 has static IP: 192.168.8.161
- [ ] Both goblins can reach MonsterBox (ping test)
- [ ] Port 3001 is available on both goblins
- [ ] Network is stable

### Goblin Hardware
- [ ] Raspberry Pi 3B+ or better
- [ ] 8GB+ microSD card with OS installed
- [ ] HDMI display/projector connected
- [ ] Network connection (WiFi or Ethernet)
- [ ] Power supply connected
- [ ] USB stick with videos (optional)

### Software Prerequisites
- [ ] Raspberry Pi OS (Bullseye or newer)
- [ ] Node.js 18+ installed
- [ ] npm 8+ installed
- [ ] mpv video player installed
- [ ] Git installed (for cloning repository)

## Deployment Checklist - goblin1

### 1. Access goblin1
```bash
ssh remote@192.168.8.160
```
- [ ] SSH connection successful
- [ ] User has sudo privileges

### 2. Clone/Update Repository
```bash
cd ~
git clone https://github.com/arwpc/MonsterBox.git
# or if already exists:
cd MonsterBox && git pull
```
- [ ] Repository cloned/updated successfully
- [ ] goblin-system directory exists

### 3. Set Environment Variables
```bash
export GOBLIN_ID="goblin1"
export GOBLIN_PORT="3001"
export MONSTERBOX_HOST="192.168.8.200"
```
- [ ] Environment variables set
- [ ] Variables verified with `echo $GOBLIN_ID`

### 4. Run Deployment Script
```bash
cd ~/MonsterBox/goblin-system
chmod +x deploy-production.sh
./deploy-production.sh
```
- [ ] Script executed without errors
- [ ] All checks passed
- [ ] Service created and started
- [ ] Configuration file created

### 5. Verify Deployment
```bash
./verify-production.sh
```
- [ ] All verification checks passed
- [ ] Service is enabled
- [ ] Service is running
- [ ] HTTP endpoint responding
- [ ] Logs are being written

### 6. Check Service Status
```bash
sudo systemctl status goblin
```
- [ ] Service is active (running)
- [ ] Service is enabled
- [ ] No errors in status output

### 7. Check Logs
```bash
tail -f ~/goblin/logs/goblin.log
```
- [ ] Logs show goblin starting
- [ ] Beacon service started
- [ ] No error messages
- [ ] Scanning for MonsterBox

### 8. Verify Registration
From MonsterBox:
```bash
curl http://192.168.8.200:3000/api/goblins
```
- [ ] goblin1 appears in list
- [ ] Status shows "online"
- [ ] Endpoint is correct

### 9. Test Video Playback
```bash
curl -X POST http://192.168.8.160:3001/api/play \
  -H "Content-Type: application/json" \
  -d '{"videoId": "video/Poltergeist/PHA_Poltergeist_AmpedUp_Win_H.mp4", "loop": true, "volume": 80}'
```
- [ ] Video plays on display
- [ ] Audio works
- [ ] Video loops correctly

### 10. Reboot Test
```bash
sudo reboot
```
Wait 2-3 minutes, then:
- [ ] Service auto-started
- [ ] Goblin re-registered with MonsterBox
- [ ] HTTP endpoint responding
- [ ] Ready to receive commands

## Deployment Checklist - goblin2

### 1. Access goblin2
```bash
ssh remote@192.168.8.161
```
- [ ] SSH connection successful
- [ ] User has sudo privileges

### 2. Clone/Update Repository
```bash
cd ~
git clone https://github.com/arwpc/MonsterBox.git
# or if already exists:
cd MonsterBox && git pull
```
- [ ] Repository cloned/updated successfully
- [ ] goblin-system directory exists

### 3. Set Environment Variables
```bash
export GOBLIN_ID="goblin2"
export GOBLIN_PORT="3001"
export MONSTERBOX_HOST="192.168.8.200"
```
- [ ] Environment variables set
- [ ] Variables verified with `echo $GOBLIN_ID`

### 4. Run Deployment Script
```bash
cd ~/MonsterBox/goblin-system
chmod +x deploy-production.sh
./deploy-production.sh
```
- [ ] Script executed without errors
- [ ] All checks passed
- [ ] Service created and started
- [ ] Configuration file created

### 5. Verify Deployment
```bash
./verify-production.sh
```
- [ ] All verification checks passed
- [ ] Service is enabled
- [ ] Service is running
- [ ] HTTP endpoint responding
- [ ] Logs are being written

### 6. Check Service Status
```bash
sudo systemctl status goblin
```
- [ ] Service is active (running)
- [ ] Service is enabled
- [ ] No errors in status output

### 7. Check Logs
```bash
tail -f ~/goblin/logs/goblin.log
```
- [ ] Logs show goblin starting
- [ ] Beacon service started
- [ ] No error messages
- [ ] Scanning for MonsterBox

### 8. Verify Registration
From MonsterBox:
```bash
curl http://192.168.8.200:3000/api/goblins
```
- [ ] goblin2 appears in list
- [ ] Status shows "online"
- [ ] Endpoint is correct

### 9. Test Video Playback
```bash
curl -X POST http://192.168.8.161:3001/api/play \
  -H "Content-Type: application/json" \
  -d '{"videoId": "video/wraith/PHA_Wraith_FaceOfDeath_Win_H.mp4", "loop": true, "volume": 80}'
```
- [ ] Video plays on display
- [ ] Audio works
- [ ] Video loops correctly

### 10. Reboot Test
```bash
sudo reboot
```
Wait 2-3 minutes, then:
- [ ] Service auto-started
- [ ] Goblin re-registered with MonsterBox
- [ ] HTTP endpoint responding
- [ ] Ready to receive commands

## Dual Goblin Testing

### 1. Verify Both Goblins Online
From MonsterBox:
```bash
curl http://192.168.8.200:3000/api/goblins
```
- [ ] Both goblin1 and goblin2 show "online"
- [ ] Both have correct endpoints
- [ ] Both show correct capabilities

### 2. Test Dual Goblin Scene
From MonsterBox UI:
- Navigate to: http://192.168.8.200:3000/scenes
- Find scene: "Dual Goblin Video Test - Production Ready" (ID: 7)
- Click "Play Scene"

Or via API:
```bash
curl -X POST http://192.168.8.200:3000/scenes/api/7/play
```

Verify:
- [ ] goblin1 plays first video
- [ ] goblin2 plays first video
- [ ] Both videos play simultaneously
- [ ] Scene waits correctly
- [ ] goblin1 plays second video
- [ ] goblin2 plays second video
- [ ] Scene completes successfully

### 3. Test Individual Control
```bash
# Play different videos on each goblin
curl -X POST http://192.168.8.160:3001/api/play \
  -H "Content-Type: application/json" \
  -d '{"videoId": "video/fire/541_JB_HD.mov", "loop": true, "volume": 80}'

curl -X POST http://192.168.8.161:3001/api/play \
  -H "Content-Type: application/json" \
  -d '{"videoId": "video/ethereal/307_JB_HD.mov", "loop": true, "volume": 80}'
```
- [ ] Both goblins play different videos
- [ ] Videos play simultaneously
- [ ] No interference between goblins

### 4. Test Stop Commands
```bash
curl -X POST http://192.168.8.160:3001/api/stop
curl -X POST http://192.168.8.161:3001/api/stop
```
- [ ] Both videos stop
- [ ] Displays return to idle state

## Production Readiness Checklist

### Auto-Start
- [ ] goblin1 service enabled
- [ ] goblin2 service enabled
- [ ] Both services start on boot
- [ ] Reboot test passed for both

### Auto-Registration
- [ ] goblin1 registers automatically
- [ ] goblin2 registers automatically
- [ ] Registration survives reboot
- [ ] Heartbeat maintained

### Video Playback
- [ ] goblin1 plays videos correctly
- [ ] goblin2 plays videos correctly
- [ ] Audio works on both
- [ ] Videos loop correctly
- [ ] Stop commands work

### Scene Control
- [ ] Dual goblin scene works
- [ ] Individual goblin scenes work
- [ ] Scene queue works
- [ ] Scene controls work (play/pause/stop)

### Monitoring & Logging
- [ ] Application logs working
- [ ] System logs working
- [ ] Log rotation configured
- [ ] Logs accessible remotely

### Network & Connectivity
- [ ] Static IPs configured
- [ ] Network stable
- [ ] Can reach MonsterBox
- [ ] HTTP endpoints responding
- [ ] Auto-reconnect works

### Documentation
- [ ] Production guide reviewed
- [ ] Quick reference available
- [ ] Troubleshooting guide available
- [ ] Team trained on management

## Post-Deployment Tasks

### 1. Document Configuration
- [ ] Record goblin IPs in network documentation
- [ ] Document video file locations
- [ ] Document any custom configuration
- [ ] Update system architecture diagram

### 2. Create Backup
- [ ] Backup goblin1 configuration
- [ ] Backup goblin2 configuration
- [ ] Backup video files
- [ ] Document backup procedure

### 3. Monitor Performance
- [ ] Check CPU usage
- [ ] Check memory usage
- [ ] Check disk space
- [ ] Check network bandwidth

### 4. Schedule Maintenance
- [ ] Plan regular updates
- [ ] Plan log rotation
- [ ] Plan video library updates
- [ ] Plan system health checks

## Troubleshooting Reference

### Service Won't Start
```bash
sudo journalctl -u goblin -n 50
sudo systemctl restart goblin
```

### Can't Connect to MonsterBox
```bash
ping 192.168.8.200
curl http://192.168.8.200:3000/api/system/info
```

### Video Won't Play
```bash
ls -lh ~/goblin/media/video/
mpv ~/goblin/media/video/test.mp4
```

### No Audio
```bash
amixer cset numid=3 2  # HDMI
speaker-test -t wav -c 2
```

## Success Criteria

✅ All pre-deployment checks passed  
✅ Both goblins deployed successfully  
✅ Both goblins auto-start on boot  
✅ Both goblins auto-register with MonsterBox  
✅ Dual goblin test scene works  
✅ Individual video playback works  
✅ Reboot tests passed  
✅ Documentation complete  
✅ Team trained  
✅ Production ready  

---

**Deployment Date:** _____________  
**Deployed By:** _____________  
**Verified By:** _____________  
**Status:** ☐ Ready for Production  

**Notes:**
_____________________________________________
_____________________________________________
_____________________________________________

