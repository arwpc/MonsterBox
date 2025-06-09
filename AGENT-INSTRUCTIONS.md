# 🤖 Three Independent Augment Remote Agents - Instructions

## 🎯 **Agent Assignments**

### **Agent 1: AI Integration Testing**
- **Branch**: `agent-1-ai-fixes`
- **URL**: http://localhost:3000/ai-integration-test.html
- **Focus**: AI Chat, Character Management, TTS, System Status, WebSocket
- **Test Suite**: `tests/agent-1-ai-integration.test.js`
- **Startup**: `./start-agent-1.sh`

### **Agent 2: ChatterPi Interactive Chat**
- **Branch**: `agent-2-chatterpi-fixes`
- **URL**: http://localhost:3000/chatterpi-chat.html
- **Focus**: Real-time AI Conversation, Jaw Animation Sync, WebSocket Connection
- **Test Suite**: `tests/agent-2-chatterpi-chat.test.js`
- **Startup**: `./start-agent-2.sh`

### **Agent 3: Main Application Testing**
- **Branch**: `agent-3-main-app-fixes`
- **URL**: http://localhost:3000 (entire application)
- **Focus**: Complete application testing, all buttons, functions, console errors
- **Test Suite**: `tests/agent-3-main-application.test.js`
- **Startup**: `./start-agent-3.sh`

## 🚀 **How to Start Each Agent**

### **Option 1: Separate Terminals**
```bash
# Terminal 1 - Agent 1
./start-agent-1.sh

# Terminal 2 - Agent 2  
./start-agent-2.sh

# Terminal 3 - Agent 3
./start-agent-3.sh
```

### **Option 2: Separate VS Code Windows**
1. Open VS Code in MonsterBox directory
2. Open 2 more VS Code windows in the same directory
3. In each window, run the respective agent startup script
4. Each Augment instance works on different branch automatically

## 📋 **Agent Responsibilities**

### **All Agents Must:**
1. **Test Every Function**: Click every button, test every feature
2. **Monitor Console**: Continuously watch for JavaScript errors
3. **Use MCP Logging**: Leverage MCP tools for comprehensive logging
4. **Fix Issues Found**: Debug and resolve all errors discovered
5. **Update Tests**: Modify test suites as issues are fixed
6. **Document Changes**: Commit fixes with descriptive messages
7. **Cross-Platform Testing**: Test on both Windows and Raspberry Pi if possible

### **Agent 1 Specific Tasks:**
- Test AI character conversations (Orlok, Coffin Breaker, Skeleton, Pumpkinhead)
- Verify TTS generation with TopMediai API integration
- Check character profile management and conversation history
- Test WebSocket real-time communication
- Monitor AI service health and API key status
- Validate error handling for invalid inputs

### **Agent 2 Specific Tasks:**
- Test real-time AI conversation with jaw animation
- Verify jaw movement synchronization with audio playback
- Check WebSocket connection stability for jaw animation
- Test audio volume analysis and processing
- Validate jaw animation visualization and timing
- Test voice input functionality if available
- Monitor performance during simultaneous operations

### **Agent 3 Specific Tasks:**
- Test complete application navigation and routing
- Verify all character management features
- Test scene creation, editing, and playback controls
- Check hardware control interfaces (servo, LED, camera)
- Test audio/video playback and processing
- Validate form submissions and input validation
- Test API endpoints comprehensively
- Monitor for any console errors across entire application

## 🔧 **Available Commands**

```bash
# Coordination
./coordinate-agents.sh          # View agent status and coordination dashboard

# Individual Agent Control
./start-agent-1.sh             # Start Agent 1 environment
./start-agent-2.sh             # Start Agent 2 environment  
./start-agent-3.sh             # Start Agent 3 environment

# Testing
npm test                       # Run all existing MonsterBox tests
npm test -- tests/agent-1-ai-integration.test.js    # Run Agent 1 tests only
npm test -- tests/agent-2-chatterpi-chat.test.js    # Run Agent 2 tests only
npm test -- tests/agent-3-main-application.test.js  # Run Agent 3 tests only

# Git Management
git status                     # Check current branch and changes
git checkout [branch-name]     # Switch between agent branches
git log --oneline             # View recent commits
```

## 🔄 **Workflow Process**

### **1. Initial Setup** ✅ COMPLETE
- [x] Environment configured with Node.js 20.x, Python 3, dependencies
- [x] Three Git branches created for parallel development
- [x] Test suites created with Mocha framework
- [x] Agent startup scripts and coordination tools ready
- [x] API keys configured for full functionality

### **2. Agent Execution** 🎯 READY TO START
Each agent should:
1. Switch to their assigned branch
2. Start their application instance (different ports)
3. Run their test suite to identify issues
4. Open browser to their assigned URL
5. Begin systematic testing and debugging
6. Fix issues as they're discovered
7. Update tests to reflect fixes
8. Commit changes with descriptive messages

### **3. Integration and Completion**
When all agents complete their work:
```bash
git checkout main
git merge agent-1-ai-fixes
git merge agent-2-chatterpi-fixes  
git merge agent-3-main-app-fixes
git push origin main
```

## 🎯 **Success Criteria**

### **Agent 1 Success:**
- ✅ AI Integration Test page loads without errors
- ✅ All character conversations work properly
- ✅ TTS generation functions correctly
- ✅ WebSocket connections are stable
- ✅ System status monitoring is accurate
- ✅ All console errors resolved

### **Agent 2 Success:**
- ✅ ChatterPi Chat page loads without errors
- ✅ Real-time AI conversations work smoothly
- ✅ Jaw animation syncs perfectly with audio
- ✅ WebSocket connections are reliable
- ✅ Audio processing works correctly
- ✅ All console errors resolved

### **Agent 3 Success:**
- ✅ Entire application functions without errors
- ✅ All buttons and links work properly
- ✅ Character and scene management is functional
- ✅ Hardware controls respond correctly
- ✅ Audio/video features work as expected
- ✅ All forms validate and submit properly
- ✅ All console errors resolved

## 🎉 **Ready for Autonomous Operation!**

The three independent Augment Remote Agents are now ready to work simultaneously on debugging and fixing MonsterBox. Each agent has:

- ✅ **Dedicated branch** for isolated development
- ✅ **Specific focus area** to avoid conflicts
- ✅ **Complete environment** with all dependencies
- ✅ **Test framework** integration with existing Mocha tests
- ✅ **Task coordination** for organized development

**Start the agents and let them work autonomously to debug, test, and fix every aspect of MonsterBox!** 🚀
