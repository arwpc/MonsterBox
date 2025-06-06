# 🎃 MonsterBox

MonsterBox is a next-generation platform for building, programming, and running interactive animatronic characters and scenes.

## 📚 Documentation

**All documentation has been organized in the `docs/` directory for better navigation:**

👉 **[Complete Documentation Index](docs/README.md)** 👈

## 🚀 Quick Start

1. **Installation**: See [docs/install.md](docs/install.md)
2. **Setup Animatronics**: Follow [docs/setup/ANIMATRONIC-SETUP-GUIDE.md](docs/setup/ANIMATRONIC-SETUP-GUIDE.md)
3. **SSH Configuration**: Use [docs/setup/ANIMATRONIC-SSH-SETUP.md](docs/setup/ANIMATRONIC-SSH-SETUP.md)

## 🔧 Common Commands

```bash
# Start the application
npm start

# Test all systems
npm test

# Test animatronic SSH connectivity
npm run test:animatronic-ssh

# Test MCP log collection
npm run test:mcp

# Interactive animatronic management
npm run animatronic:manage
```

## 📁 Key Directories

- **`docs/`** - All documentation (setup, guides, API, security)
- **`scripts/`** - Management and testing scripts
- **`data/`** - All JSON configuration, character, scene, and sound data
- **`routes/`** - Web API endpoints
- **`views/`** - Web interface templates

## 🎯 Current Animatronics

- **Orlok** (192.168.8.120) - Vampire animatronic
- **Pumpkinhead** (192.168.1.101) - Pumpkin-headed demon (currently offline)
- **Coffin** (192.168.8.149) - Coffin with emerging figure

## 🔐 Security

- Environment variables in `.env` file (not committed)
- Individual SSH credentials per animatronic
- API keys managed securely
- See [docs/security/](docs/security/) for details

## 📞 Support

- **Documentation**: [docs/README.md](docs/README.md)
- **FAQ**: [docs/faq.md](docs/faq.md)
- **Troubleshooting**: [docs/setup/ANIMATRONIC-SSH-SETUP.md#troubleshooting](docs/setup/ANIMATRONIC-SSH-SETUP.md#troubleshooting)

---

*For complete documentation, visit the [docs/](docs/) directory.*
