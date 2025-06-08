# Remote Agent Setup Fix - MonsterBox Project

## Issue Description

Remote agents are failing during initialization with the error:
```
Directory not found: c:\Users\arwpe\CodeBase\MonsterBox-1
```

This occurs because remote agents run in their own environments (typically Linux containers) and cannot access Windows-specific file paths.

## Root Cause

The remote agent is configured with the local Windows development path `c:\Users\arwpe\CodeBase\MonsterBox-1`, but this path doesn't exist in the remote agent's environment.

## Solution

### Step 1: Remote Agent Environment Setup

When creating a remote agent, ensure it follows this setup process:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/arwpc/MonsterBox.git
   cd MonsterBox
   ```

2. **Initialize Task Master with Correct Path**:
   ```bash
   # Use the current directory (cloned repository) as project root
   task-master init --project-root $(pwd)
   ```

3. **Verify Task Master Configuration**:
   ```bash
   # Check that tasks are accessible
   task-master get-tasks
   ```

### Step 2: Remote Agent Configuration

When setting up the remote agent, use these guidelines:

1. **Repository URL**: `https://github.com/arwpc/MonsterBox.git`
2. **Branch**: `main` (or appropriate feature branch)
3. **Project Root**: Use relative path or let the agent determine from cloned repository
4. **Working Directory**: The cloned repository directory

### Step 3: Task Master Initialization

The remote agent should run:

```bash
# Navigate to cloned repository
cd MonsterBox

# Initialize Task Master AI with current directory
task-master init --project-root $(pwd) --yes

# Verify initialization
task-master get-task --id 17
```

### Step 4: Environment Variables

Ensure the remote agent has access to required environment variables:
- API keys for OpenAI, TopMediai, etc.
- Any other configuration needed for the specific task

## Verification Steps

After setup, the remote agent should be able to:

1. **Access Task Master**:
   ```bash
   task-master get-tasks --project-root $(pwd)
   ```

2. **Read Task 17**:
   ```bash
   task-master get-task --id 17 --project-root $(pwd)
   ```

3. **Access Project Files**:
   ```bash
   ls -la  # Should show MonsterBox project structure
   cat package.json  # Should show project configuration
   ```

## Common Issues & Solutions

### Issue: "Directory not found"
**Solution**: Ensure the remote agent clones the repository and uses the cloned directory as project root.

### Issue: "Task Master not initialized"
**Solution**: Run `task-master init --project-root $(pwd) --yes` in the cloned repository.

### Issue: "API keys not found"
**Solution**: Ensure environment variables are properly configured in the remote agent environment.

## Remote Agent Prompt Template

When creating a remote agent, use this setup prompt:

```
You are a remote agent working on MonsterBox Task 17. 

SETUP INSTRUCTIONS:
1. Clone the repository: git clone https://github.com/arwpc/MonsterBox.git
2. Navigate to the cloned directory: cd MonsterBox
3. Initialize Task Master: task-master init --project-root $(pwd) --yes
4. Verify setup: task-master get-task --id 17 --project-root $(pwd)

IMPORTANT: 
- Use $(pwd) or the current directory as project root, NOT Windows paths
- All Task Master commands should include --project-root $(pwd)
- Work within the cloned repository structure

TASK: [Your specific task instructions here]
```

## Testing the Fix

To test that the remote agent setup works:

1. Create a new remote agent with the corrected setup instructions
2. Monitor the initialization process
3. Verify that Task Master commands work correctly
4. Confirm the agent can access and work with the project files

## Next Steps

1. Update any existing remote agent configurations
2. Use the corrected setup process for new remote agents
3. Document this process for future remote agent deployments
4. Consider creating an automated setup script for remote agents
