# 🔐 SSH Access Rules - MANDATORY

**Effective Date**: 2025-10-01  
**Status**: CRITICAL - MUST FOLLOW

---

## ⚠️ CRITICAL RULE

**NEVER use plain `ssh` commands that require manual password entry!**

This has been a repeated mistake. Follow these rules ALWAYS:

---

## ✅ CORRECT Methods for SSH Access

### Method 1: Use sshpass (PREFERRED)
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "command"
sshpass -p 'klrklr89!' ssh remote@192.168.8.161 "command"
```

### Method 2: Use MCP Remote Access
Use the MCP (Model Context Protocol) remote access tool to gain SSH access to RPIs.

### Method 3: Use curl for API calls
If the goblin has an API endpoint, use curl instead:
```bash
curl http://192.168.8.160:3001/endpoint
```

---

## ❌ NEVER DO THIS

```bash
# BAD - Will hang waiting for password
ssh remote@192.168.8.160 "command"

# BAD - Will prompt for password
ssh remote@192.168.8.161 "ls"
```

---

## 🎯 Standard Credentials

### Goblin RPIs
- **Username**: `remote`
- **Password**: `klrklr89!`
- **Goblin 1 IP**: `192.168.8.160`
- **Goblin 2 IP**: `192.168.8.161`

### MonsterBox Main
- **IP**: `192.168.8.200`
- **Port**: `3000`

---

## 📝 Common Commands

### Check Goblin Status
```bash
# Via API (preferred)
curl -s http://192.168.8.160:3001/health

# Via SSH
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "systemctl status goblin"
```

### Restart Goblin Service
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "sudo systemctl restart goblin"
```

### View Goblin Logs
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "journalctl -u goblin -n 50"
```

### Check Running Processes
```bash
sshpass -p 'klrklr89!' ssh remote@192.168.8.160 "ps aux | grep goblin"
```

---

## 🔧 Install sshpass (if needed)

```bash
sudo apt-get install sshpass
```

---

## 🎯 Remember

1. ✅ **ALWAYS** use `sshpass -p 'klrklr89!'` before `ssh`
2. ✅ **ALWAYS** prefer API calls over SSH when possible
3. ✅ **ALWAYS** use MCP remote access for interactive sessions
4. ❌ **NEVER** use plain `ssh` that requires manual password entry

---

**This rule is MANDATORY and must be followed in ALL future interactions!**

