# FAQ / Troubleshooting

## Common Issues

### Server won't start
- Check Node.js version: `node --version` (requires 20.x)
- Check port availability: `sudo lsof -i :3000`
- Review logs: `sudo journalctl -u monsterbox.service -f`

### Audio not working
- Verify PipeWire is running: `wpctl status`
- Check speaker configuration in the calibration page

### Hardware not responding
- Verify GPIO connections match the part configuration
- Check that Python wrappers are installed: `npm run install:python`
- Run in test mode to isolate: `MB_TEST_MODE=1 npm start`
