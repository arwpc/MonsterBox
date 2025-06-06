# Task #1: Initialize Node.js/Express Backend - Agent Alpha

## 🎯 Your Mission
Initialize the core backend infrastructure for MonsterBox with Node.js and Express, including TypeScript support and basic project structure.

## 📋 Detailed Requirements

### 1. Project Initialization
- **Node.js Version**: 20.x LTS
- **Package Manager**: npm (already has package.json)
- **TypeScript**: Configure with strict settings
- **Express Version**: 4.18.x (already installed as 4.21.1)

### 2. Folder Structure to Create
```
src/
├── controllers/     # Move existing controllers here
├── services/        # Move existing services here  
├── routes/          # Move existing routes here
├── middleware/      # New - error handling, auth, etc.
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── app.ts           # Main application file (TypeScript)

config/
├── database.ts      # Database configuration (if needed)
├── environment.ts   # Environment variable handling
└── server.ts        # Server configuration

dist/                # Compiled TypeScript output
```

### 3. TypeScript Configuration
Create `tsconfig.json` with:
- Strict mode enabled
- ES2020 target
- Node module resolution
- Source maps for debugging
- Output to `dist/` directory

### 4. Environment Configuration
Enhance existing `.env` setup:
- Type-safe environment variable loading
- Validation for required variables
- Development/production configurations

### 5. Express Application Setup
Create `src/app.ts` with:
- Express app initialization
- Middleware setup (body parsing, CORS, etc.)
- Error handling middleware
- Health check endpoint at `/health`
- Static file serving for `/public`

### 6. Basic Error Handling
Implement middleware for:
- 404 Not Found handler
- Global error handler
- Request logging
- Graceful shutdown handling

### 7. Health Check Endpoint
Create `/health` endpoint that returns:
```json
{
  "status": "healthy",
  "timestamp": "2025-06-06T15:00:00.000Z",
  "version": "1.0.0",
  "environment": "development",
  "services": {
    "database": "connected",
    "ssh": "available"
  }
}
```

## 🧪 Testing Requirements

### Unit Tests (Jest)
- Test Express app initialization
- Test health check endpoint
- Test error handling middleware
- Test environment configuration loading

### Integration Tests
- Test full server startup
- Test basic HTTP requests
- Test graceful shutdown

## 📁 Files to Create/Modify

### New Files:
- `tsconfig.json`
- `src/app.ts`
- `src/server.ts`
- `config/environment.ts`
- `src/middleware/errorHandler.ts`
- `src/middleware/requestLogger.ts`
- `src/types/environment.d.ts`
- `tests/app.test.ts`
- `tests/health.test.ts`

### Files to Modify:
- `package.json` (add TypeScript scripts)
- Move existing files to new `src/` structure

## 🔧 Development Scripts
Add to package.json:
```json
{
  "scripts": {
    "build": "tsc",
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "start": "node dist/server.js",
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

## 🎯 Success Criteria
- ✅ TypeScript compilation works without errors
- ✅ Express server starts successfully
- ✅ Health check endpoint responds correctly
- ✅ All tests pass
- ✅ Environment variables load properly
- ✅ Error handling works correctly
- ✅ Code follows TypeScript best practices

## 🤝 Coordination with Agent Beta (Me)
- I'll be working on SSH Connection Manager (Task #2)
- I'll integrate with your backend structure once you complete
- Keep the architecture modular so I can add SSH services
- Use dependency injection patterns where possible

## 📞 Communication
- Commit frequently with descriptive messages
- Use conventional commit format: `feat:`, `fix:`, `refactor:`, etc.
- Create PR when complete with detailed description
- I'll monitor your progress and adapt my SSH manager accordingly

## ⏰ Estimated Timeline
- **Hour 1**: TypeScript setup and basic structure
- **Hour 2**: Express app and middleware implementation  
- **Hour 3**: Testing and refinement
- **Total**: ~3 hours

**Ready to start? Switch to the `feature/task-1-backend-init` branch and begin! 🚀**
