# Complete Character Hardcoding Analysis - v6.0.0 Audit Addendum

**Date:** 2026-02-14
**Scope:** ALL characters in MonsterBox (IDs 1-7, plus unregistered ID 8-9)

---

## Executive Summary

Extended analysis reveals **character hardcoding is widespread** across the codebase, affecting ALL characters, not just Orlok. Found **48+ instances** of hardcoded character names, IDs, agent IDs, and IP addresses across 15 files.

**Severity:** HIGH - Violates core character independence requirement
**Impact:** Prevents true multi-character flexibility, creates maintenance burden
**Fix Complexity:** MEDIUM - Requires config-driven architecture changes

---

## Character Hardcoding by Type

### 1. Hardcoded Character Names (ALL Characters)

#### services/characterService.js
**Lines 20-23, 42-45** - Hardcoded fallback character list
```javascript
return [
    { id: 1, name: 'PumpkinHead' },      // HARDCODED
    { id: 2, name: 'Mina' },   // HARDCODED
    { id: 3, name: 'Orlok' },            // HARDCODED
    { id: 4, name: 'Sir Dragomir' }       // HARDCODED
];
```
**Issue:** Should return empty array or error, not hardcoded fallback

#### services/orchestrationService.js
**Lines 17-21** - Complete animatronic network topology hardcoded
```javascript
this.animatronics = [
    { id: 1, name: 'PumpkinHead', hostname: 'pumpkinhead', ip: '192.168.8.150', port: 3000, characterId: 8, agentId: 'agent_0801k3f1dybkecj88sta18gwwrv5' },
    { id: 2, name: 'Mina', hostname: 'mina', ip: '192.168.8.140', port: 3000, characterId: 2, agentId: 'agent_8401k3f1dx98e05t94yp6kz4vf8n' },
    { id: 3, name: 'Orlok', hostname: 'orlok', ip: '192.168.8.120', port: 3000, characterId: 3, agentId: 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n' },
    { id: 4, name: 'Sir Dragomir', hostname: 'sirdragomir', ip: '192.168.8.130', port: 3000, characterId: 4, agentId: 'agent_7901k3f1dza1ee68w1257zh3s9x6' },
    { id: 5, name: 'Groundbreaker', hostname: 'groundbreaker', ip: '192.168.8.200', port: 3000, characterId: 9, agentId: 'agent_4201k6s9y384f9v9hqmg67ygc645' }
];
```
**Issue:** Should load from `config/animatronics.json` (file already exists!)

**Lines 29-34** - Hardcoded character order priorities
```javascript
this.characterOrder = {
    'PumpkinHead': 100,      // HARDCODED
    'Mina': 1,     // HARDCODED
    'Orlok': 100,            // HARDCODED
    'Sir Dragomir': 9,        // HARDCODED
    'Groundbreaker': 1       // HARDCODED
};
```
**Issue:** Should be config-driven or database-stored

#### services/elevenLabsAgentService.js
**Lines 320-424** - Hardcoded character prompts and response templates
```javascript
const prompts = {
    'Orlok': {
        prompt: `You are Orlok, an ancient and mysterious vampire...`,
    },
    // ... more hardcoded prompts
};

const responses = {
    'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n': { // Orlok
        greetings: [...],
        questions: [...],
        default: [...]
    },
    'agent_7901k3f1dza1ee68w1257zh3s9x6': { // Sir Dragomir
        // ...
    },
    'agent_8401k3f1dx98e05t94yp6kz4vf8n': { // Mina
        // ...
    }
    // NOTE: PumpkinHead agent referenced but no prompt defined
};
```
**Issue:** Should load from `data/character-{id}/ai-config/agent-config.json`

---

### 2. Hardcoded Character IDs

#### controllers/posesController.js
**Line 358** - Default to character 4 (Sir Dragomir)
```javascript
function getCurrentCharacterId(req) {
    return parseInt(req.query.characterId) ||
           parseInt(req.app.locals?.config?.selectedCharacter) ||
           4; // Default to character 4 (Sir Dragomir) - HARDCODED
}
```
**Issue:** Should error or use first-available character from database

#### services/poses/poseEngine.js
**Line 580** - Default to character 3 (Orlok)
```javascript
const characterId = config.selectedCharacter || 3; // HARDCODED
```
**Issue:** Should throw error if no character selected

#### Multiple Route Files - Default to character 1
**Found in:**
- `routes/conversation.js:277` - `characterId || getCurrentCharacterId(req) || 1`
- `routes/setup/jaw-animation.js:20` - `parseInt(config.selectedCharacter, 10) || 1`
- `routes/scenes/api.js:17` - `parseInt(req.app.locals?.config?.selectedCharacter, 10) || 1`
- `routes/api/sceneEditorApi.js:15` - `parseInt(req.app.locals?.config?.selectedCharacter, 10) || 1`
- `routes/api/randomPoseRoutes.js:76` - `characterId || req.app?.locals?.config?.selectedCharacter || 1`
- `routes/aiSettingsRoutes.js:34` - `parseInt(config.selectedCharacter, 10) || 1`
- `routes/aiSettingsRoutes.js:125` - `parseInt(appConfig.selectedCharacter, 10) || 1`

**Issue:** Inconsistent defaults (character 1 vs 3 vs 4) across codebase

---

### 3. Hardcoded Agent IDs (ElevenLabs)

#### services/elevenLabsAgentService.js
**Line 426** - Fallback to Orlok's agent
```javascript
const agentResponses = responses[agentId] || responses['agent_0801k3f1dw7xe2g8r4jkbxk0gt2n']; // HARDCODED Orlok agent
```
**Issue:** Should error if agent ID not found, not fallback to Orlok

**Lines 356-407** - Hardcoded agent ID to character mapping
```javascript
'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n': { // Orlok
'agent_7901k3f1dza1ee68w1257zh3s9x6': { // Sir Dragomir
'agent_8401k3f1dx98e05t94yp6kz4vf8n': { // Mina
'agent_0801k3f1dybkecj88sta18gwwrv5': { // PumpkinHead (line 373 comment)
```
**Issue:** Should load from character config files

#### services/orchestrationService.js
**Lines 17-21** - Agent IDs in animatronic definitions
```javascript
agentId: 'agent_0801k3f1dybkecj88sta18gwwrv5'  // PumpkinHead
agentId: 'agent_8401k3f1dx98e05t94yp6kz4vf8n'  // Mina
agentId: 'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n'  // Orlok
agentId: 'agent_7901k3f1dza1ee68w1257zh3s9x6'  // Sir Dragomir
agentId: 'agent_4201k6s9y384f9v9hqmg67ygc645'  // Groundbreaker
```
**Issue:** Should load from config file

---

### 4. Hardcoded IP Addresses (Network Topology)

#### services/orchestrationService.js
**Lines 17-21** - Animatronic IP addresses
```javascript
ip: '192.168.8.150'  // PumpkinHead
ip: '192.168.8.140'  // Mina
ip: '192.168.8.120'  // Orlok
ip: '192.168.8.130'  // Sir Dragomir
ip: '192.168.8.200'  // Groundbreaker
```
**Issue:** Should load from `config/animatronics.json` (which already has this data!)

**Lines 26-27** - Goblin IP addresses
```javascript
{ id: 'chestwound', name: 'Chestwound Goblin', ip: '192.168.8.160', port: 3001 },
{ id: 'goblin2', name: 'Goblin2', ip: '192.168.8.161', port: 3001 }
```
**Issue:** Should load from `data/goblins.json`

#### config/animatronics.json
**Lines 2-7** - CORRECT CONFIG FILE (not being used!)
```json
{
  "orlok": { "characterId": 3, "host": "orlok.lan", "ip": "192.168.8.120" },
  "pumpkinhead": { "characterId": 1, "host": "pumpkinhead.lan", "ip": "192.168.8.150" },
  "coffin": { "characterId": 2, "host": "coffin.lan", "ip": "192.168.8.140" },
  "sirdragomir": { "characterId": 4, "host": "sirdragomir.lan", "ip": "192.168.8.130" },
  "groundbreaker": { "characterId": 5, "host": "groundbreaker.lan", "ip": "192.168.8.200" }
}
```
**Note:** This config file exists but `orchestrationService.js` doesn't use it!

---

### 5. Hardcoded Character-Specific Comments

#### services/serverSTTListener.js
**Line 37** - Orlok-specific comment
```javascript
// 1) First try Python/PyAudio route which is verified working on Orlok
```
**Issue:** Implies implementation only tested on Orlok

#### services/jawAnimationSuperPowerService.js
**Line 245** - Orlok jaw range comment
```javascript
const minA = 70, maxA = 93; // typical Orlok jaw range
```
**Issue:** Implies default values based on Orlok's hardware

#### services/sttFilterPresets.js
**Line 12** - Orlok-specific tuning comment
```javascript
description: 'Optimized for loud background music, crowds, or ambient noise - tuned on Orlok',
```
**Issue:** Implies filter preset calibrated specifically for Orlok

---

## Hardcoding Impact by Character

| Character | Name Refs | ID Defaults | Agent IDs | IP Addrs | Comments | Total |
|-----------|-----------|-------------|-----------|----------|----------|-------|
| PumpkinHead | 5 | 7 | 2 | 1 | 0 | **15** |
| Mina | 5 | 0 | 2 | 1 | 0 | **8** |
| Orlok | 5 | 1 | 2 | 1 | 3 | **12** |
| Sir Dragomir | 5 | 1 | 2 | 1 | 0 | **9** |
| Groundbreaker | 2 | 0 | 1 | 1 | 0 | **4** |
| **TOTAL** | **22** | **9** | **9** | **5** | **3** | **48+** |

---

## Character ID Default Inconsistency

**CRITICAL:** Different files default to different characters when none selected:

- **Character 1 (PumpkinHead):** 7 files (routes/conversation, jaw-animation, scenes, sceneEditorApi, randomPoseRoutes, aiSettingsRoutes)
- **Character 3 (Orlok):** 1 file (services/poses/poseEngine.js)
- **Character 4 (Sir Dragomir):** 1 file (controllers/posesController.js)

**Issue:** Inconsistent fallback behavior makes debugging difficult and creates unpredictable user experience

---

## Files Requiring Changes (Complete List)

### HIGH PRIORITY (Core Services)
1. **services/characterService.js** - Remove fallback character list
2. **services/orchestrationService.js** - Load from config/animatronics.json
3. **services/elevenLabsAgentService.js** - Load agent configs from character files
4. **services/poses/poseEngine.js** - Remove default characterId=3
5. **controllers/posesController.js** - Remove default characterId=4

### MEDIUM PRIORITY (Routes)
6. **routes/conversation.js** - Remove default characterId=1
7. **routes/setup/jaw-animation.js** - Remove default characterId=1
8. **routes/scenes/api.js** - Remove default characterId=1
9. **routes/api/sceneEditorApi.js** - Remove default characterId=1
10. **routes/api/randomPoseRoutes.js** - Remove default characterId=1
11. **routes/aiSettingsRoutes.js** - Remove defaults (2 instances)

### LOW PRIORITY (Comments/Documentation)
12. **services/serverSTTListener.js** - Update Orlok-specific comment
13. **services/jawAnimationSuperPowerService.js** - Update jaw range comment
14. **services/sttFilterPresets.js** - Update preset description

---

## Config Files to Create/Update

### Create New:
1. **data/character-{id}/ai-config/agent-config.json** (per character)
   - Structure:
   ```json
   {
     "agentId": "agent_xxx...",
     "prompt": "Character-specific prompt...",
     "responses": {
       "greetings": [...],
       "questions": [...],
       "default": [...]
     }
   }
   ```

### Update Existing:
2. **config/animatronics.json** - Add agent IDs, ensure all current animatronics listed
   - Currently has: orlok, pumpkinhead, mina, sirdragomir, groundbreaker
   - Missing: Character IDs 5, 6, 7 mapping

---

## Recommended Fix Strategy

### Phase 2A: Remove Hardcoded Defaults (Quick Wins)
**Files:** All routes and controllers
**Change:** Replace `|| 1`, `|| 3`, `|| 4` with error handling
**Risk:** LOW - Simple find/replace

### Phase 2B: Config-Driven Orchestration
**Files:** orchestrationService.js
**Change:** Load animatronics from config/animatronics.json
**Risk:** MEDIUM - Changes orchestration startup

### Phase 2C: Per-Character Agent Configs
**Files:** elevenLabsAgentService.js, data/character-*/ai-config/
**Change:** Migrate hardcoded prompts to per-character config files
**Risk:** LOW - Creates new files, updates service loader

### Phase 2D: Update Comments
**Files:** serverSTTListener.js, jawAnimationSuperPowerService.js, sttFilterPresets.js
**Change:** Make comments character-agnostic
**Risk:** LOW - Documentation only

---

## Critical Inconsistencies Found

### 1. Character ID Mismatches in Orchestration
**orchestrationService.js line 17:**
```javascript
{ id: 1, name: 'PumpkinHead', characterId: 8, ... }  // Character 8 doesn't exist in characters.json!
{ id: 5, name: 'Groundbreaker', characterId: 9, ... }  // Character 9 doesn't exist in characters.json!
```

**Issue:** Orchestration maps to non-existent character IDs 8 and 9
**data/characters.json only has IDs 1-7**

### 2. Config File Not Being Used
**config/animatronics.json exists with correct data but orchestrationService.js ignores it**

This is a double violation:
- Config file exists but unused (dead code)
- Service hardcodes data that config file already contains

---

## Test Impact

**Tests Likely to Break When Fixed:**
- Any test that doesn't explicitly set selectedCharacter
- Tests that rely on default fallback to specific character
- Orchestration tests that expect hardcoded animatronic list

**Tests to Add:**
- Character independence validation (run all tests with each character selected)
- Error handling when no character selected
- Config loading from animatronics.json

---

## Summary Statistics

- **15 Files** with hardcoded character references
- **48+ Individual instances** of hardcoding
- **5 Character names** hardcoded (all except PumpkinHead_Updated variants)
- **9 Default character ID fallbacks** (inconsistent: 1, 3, or 4)
- **5 IP addresses** hardcoded (should load from config)
- **9 Agent IDs** hardcoded (should load from character configs)
- **1 Config file** exists but unused (animatronics.json)
- **2 Character IDs** referenced that don't exist (8, 9)

---

**Analysis Completed:** 2026-02-14
**Next Step:** Update v6-audit.md with complete findings and revised phase plan
