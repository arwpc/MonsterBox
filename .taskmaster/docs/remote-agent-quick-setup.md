# Remote Agent Quick Setup - MonsterBox

## Problem
Remote agents fail with: `Directory not found: c:\Users\arwpe\CodeBase\MonsterBox-1`

## Solution
Use this setup prompt when creating remote agents:

## Remote Agent Setup Prompt Template

```
You are a remote agent working on MonsterBox Task [TASK_ID].

CRITICAL SETUP STEPS (Execute First):

1. Clone the repository:
   git clone https://github.com/arwpc/MonsterBox.git

2. Navigate to project:
   cd MonsterBox

3. Initialize Task Master:
   task-master init --project-root $(pwd) --yes

4. Verify setup:
   task-master get-task --id [TASK_ID] --project-root $(pwd)

IMPORTANT RULES:
- ALWAYS use $(pwd) as project root in Task Master commands
- NEVER use Windows paths like C:\Users\arwpe\CodeBase\MonsterBox-1
- Work within the cloned MonsterBox directory
- All task-master commands must include --project-root $(pwd)

TASK OBJECTIVE:
[Insert specific task instructions here]

Begin by executing the setup steps above, then proceed with the task.
```

## Example for Task 17

```
You are a remote agent working on MonsterBox Task 17 (Core AI Integration).

CRITICAL SETUP STEPS (Execute First):

1. Clone the repository:
   git clone https://github.com/arwpc/MonsterBox.git

2. Navigate to project:
   cd MonsterBox

3. Initialize Task Master:
   task-master init --project-root $(pwd) --yes

4. Verify setup:
   task-master get-task --id 17 --project-root $(pwd)

IMPORTANT RULES:
- ALWAYS use $(pwd) as project root in Task Master commands
- NEVER use Windows paths like C:\Users\arwpe\CodeBase\MonsterBox-1
- Work within the cloned MonsterBox directory
- All task-master commands must include --project-root $(pwd)

TASK OBJECTIVE:
Implement Core AI Integration (API Clients & Configuration) for MonsterBox animatronic system. Focus on creating robust Python clients for OpenAI and TopMediai APIs, establishing secure configuration system, and integrating the Orlok Corpus.txt for character-specific AI personalities.

Begin by executing the setup steps above, then proceed with Task 17 implementation.
```

## Verification Commands

After setup, the agent should be able to run:

```bash
# Check project structure
ls -la

# Verify Task Master works
task-master get-tasks --project-root $(pwd)

# Get specific task
task-master get-task --id 17 --project-root $(pwd)

# Check next task
task-master next-task --project-root $(pwd)
```

## Common Errors & Fixes

| Error | Fix |
|-------|-----|
| `Directory not found: c:\Users\...` | Use `$(pwd)` instead of Windows paths |
| `Task Master not initialized` | Run `task-master init --project-root $(pwd) --yes` |
| `No tasks found` | Ensure you're in the cloned MonsterBox directory |
| `Permission denied` | Check repository access and clone permissions |

## Quick Test

To test if setup worked:
```bash
task-master get-task --id 17 --project-root $(pwd) | head -10
```

Should show Task 17 details without errors.
