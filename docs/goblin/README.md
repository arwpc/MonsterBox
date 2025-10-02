# 🎃 Goblin System Documentation

**MonsterBox Goblin System** - Distributed video playback nodes for synchronized Halloween displays

---

## 📚 Documentation Index

### Production Guides
- **[GOBLIN_VIDEO_FIXES_COMPLETE.md](./GOBLIN_VIDEO_FIXES_COMPLETE.md)** - Latest fixes and production readiness report (2025-10-01)
- **[GOBLIN_PRODUCTION_GUIDE.md](./GOBLIN_PRODUCTION_GUIDE.md)** - Complete production deployment guide
- **[GOBLIN_PRODUCTION_READY_SUMMARY.md](./GOBLIN_PRODUCTION_READY_SUMMARY.md)** - Production readiness summary
- **[deployment-checklist.md](./deployment-checklist.md)** - Step-by-step deployment checklist

### Quick Reference
- **[GOBLIN_QUICK_REFERENCE.md](./GOBLIN_QUICK_REFERENCE.md)** - Quick command reference and troubleshooting
- **[goblin1-ready.md](./goblin1-ready.md)** - Goblin 1 setup completion report

### Release Documentation
- **[GOBLIN_GOLD_RELEASE.md](./GOBLIN_GOLD_RELEASE.md)** - Gold 5.0 release documentation
- **[validation-report.md](./validation-report.md)** - System validation report

---

## 🎯 Quick Start

### Current Production Goblins

**Goblin 1**
- IP: `192.168.8.160:3001`
- Location: Window 1
- Status: ✅ Production Ready

**Goblin 2**
- IP: `192.168.8.161:3001`
- Location: Window 2
- Status: ✅ Production Ready

### Management URLs

- **Goblin Management**: `http://192.168.8.200:3000/goblin-management`
- **Video Library**: `http://192.168.8.200:3000/video-library`

---

## 🔧 Key Features

- ✅ Hardware-accelerated video playback (mpv)
- ✅ Remote control via REST API
- ✅ Auto-registration with MonsterBox
- ✅ Scene integration for synchronized playback
- ✅ Systemd service for auto-start on boot
- ✅ Zero Docker overhead (native deployment)
- ✅ Production-ready with comprehensive testing

---

## 📖 Related Documentation

### Setup & Configuration
- [../setup/ANIMATRONIC-SETUP-GUIDE.md](../setup/ANIMATRONIC-SETUP-GUIDE.md) - General animatronic setup
- [../GOBLIN-PROJECT-DESIGN.md](../GOBLIN-PROJECT-DESIGN.md) - Original design document

### Testing
- [../../tests/playwright/goblin-video-critical.spec.js](../../tests/playwright/goblin-video-critical.spec.js) - Critical test suite
- [../testing/](../testing/) - General testing documentation

### API Documentation
- [../api/api-documentation.md](../api/api-documentation.md) - API reference

---

## 🎬 Common Tasks

### Check Goblin Status
```bash
curl http://192.168.8.160:3001/health
curl http://192.168.8.161:3001/health
```

### Play Video on Goblin
```bash
curl -X POST http://192.168.8.160:3001/play-video \
  -H "Content-Type: application/json" \
  -d '{"filename": "video.mp4", "loop": true}'
```

### Stop Video
```bash
curl -X POST http://192.168.8.160:3001/stop
```

### View Available Media
```bash
curl http://192.168.8.160:3001/media
```

---

## 🐛 Troubleshooting

See [GOBLIN_QUICK_REFERENCE.md](./GOBLIN_QUICK_REFERENCE.md) for detailed troubleshooting steps.

---

## 📝 Recent Updates

**2025-10-01**: 
- ✅ Fixed all 400/500 errors on goblin-management and video-library pages
- ✅ Added comprehensive test coverage (44 tests)
- ✅ Fixed video streaming endpoints
- ✅ Fixed goblin availability checking
- ✅ Both goblins production-ready

---

**For the latest information, see [GOBLIN_VIDEO_FIXES_COMPLETE.md](./GOBLIN_VIDEO_FIXES_COMPLETE.md)**

