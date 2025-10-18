# Quick Halloween Reference Card 🎃

## Goblin Video Displays

### Add New Goblin (Web UI)
1. Open: `http://localhost:3000/goblin-management`
2. Click: **Register Goblin**
3. Fill form and click **Register Goblin**

### Control Goblins
```bash
# Play video with looping
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename":"Poltergeist/video.mp4","loop":true}'

# Stop video
curl -X POST http://192.168.8.160:3001/stop-video

# Check status
curl http://192.168.8.160:3001/status
```

### Goblin Network
- **Goblin 1 (Chestwound)**: 192.168.8.160:3001
- **Goblin 2**: 192.168.8.161:3001

## Animatronic Servos (PCA9685)

### Test Servo (Web UI)
1. Open: `http://<animatronic-ip>:3000/setup/calibration`
2. Select servo part
3. Use test controls

### Test Servo (API)
```bash
# Move servo to 90 degrees
curl -X POST http://192.168.8.140:3000/setup/parts/api/parts/2/test \
  -H "Content-Type: application/json" \
  -d '{"action": "moveToAngle", "params": {"angleDeg": 90}}'
```

### Test Servo (Command Line)
```bash
ssh remote@192.168.8.140
cd ~/MonsterBox
python3 python_wrappers/servo_cli.py move_to_pca 0 90 0x40
```

## Animatronic Network

| Character | Name | IP | PCA9685 | Status |
|-----------|------|-------|---------|--------|
| 1 | PumpkinHead | 192.168.8.150 | - | - |
| 2 | Coffin | 192.168.8.140 | 0x40 | ✅ |
| 3 | Orlok | 192.168.8.120 | 0x40 | ✅ |
| 4 | Skulltalker | 192.168.8.130 | 0x40 | ✅ |
| 5 | Groundbreaker | 192.168.8.200 | - | - |

## SSH Access
```
Login:    remote
Password: klrklr89!
```

## Common Commands

### Deploy to Animatronic
```bash
./scripts/deploy-to-animatronic.sh <character-id> <ip-address>
```

### Start All Animatronics
```bash
./scripts/start-all-animatronics.sh
```

### Stop All Animatronics
```bash
./scripts/stop-all-animatronics.sh
```

### Check I2C Devices
```bash
ssh remote@<ip> "/usr/sbin/i2cdetect -y 1"
```

## Troubleshooting

### Goblin Not Responding
1. Check network: `ping 192.168.8.160`
2. Check service: `curl http://192.168.8.160:3001/health`
3. SSH and check logs: `ssh remote@192.168.8.160`

### Servo Not Moving
1. Check I2C: `ssh remote@<ip> "/usr/sbin/i2cdetect -y 1"`
2. Test direct: `python3 python_wrappers/servo_cli.py move_to_pca 0 90 0x40`
3. Check part config: `curl http://<ip>:3000/setup/parts/api/parts/<id>`

### Server Not Running
```bash
ssh remote@<ip>
cd ~/MonsterBox
npm start
```

## Video Paths (Goblins)
Videos stored at: `/home/remote/goblin/media/video/`

Example structure:
```
/home/remote/goblin/media/video/
├── Poltergeist/
│   └── PHA_Poltergeist_AmpedUp_Win_H.mp4
├── fire/
└── ethereal/
```

Use relative paths in API calls: `"Poltergeist/video.mp4"`

## Ready for Halloween! 🎃👻🦇

