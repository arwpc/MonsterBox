# Task Master Guide

## Overview

Task Master is an AI-powered task management system integrated into the MonsterBox development workflow. This guide provides comprehensive instructions for using Task Master effectively.

## Getting Started

### System Requirements
- MonsterBox project initialized
- Task Master installed and configured
- Access to AI assistant with MCP integration
- MkDocs documentation system

### Initial Setup
Task Master is already initialized in your MonsterBox project with:
- Configuration files in `.taskmaster/`
- PRD document for task generation
- 15 active tasks across all development areas
- Integration with existing MkDocs documentation

## Core Concepts

### Tasks
**Tasks** are the fundamental units of work in Task Master:
- **Unique ID**: Each task has a numeric identifier
- **Title**: Clear, descriptive task name
- **Description**: Detailed explanation of what needs to be done
- **Status**: Current state (pending, in-progress, done, deferred, cancelled)
- **Priority**: Importance level (high, medium, low)
- **Dependencies**: Other tasks that must complete first
- **Complexity**: AI-generated complexity score (1-10)

### Subtasks
**Subtasks** break down complex tasks into manageable pieces:
- **Hierarchical Structure**: Subtasks belong to parent tasks
- **Independent Tracking**: Each subtask has its own status
- **Granular Progress**: Track progress at detailed level
- **Flexible Organization**: Add/remove subtasks as needed

### Dependencies
**Dependencies** ensure proper work sequencing:
- **Blocking Relationships**: Tasks that must complete before others can start
- **Automatic Detection**: System identifies when tasks are blocked
- **Dependency Chains**: Complex multi-level dependencies supported
- **Validation**: System prevents circular dependencies

## Task Management Commands

### Viewing Tasks

#### Get All Tasks
```
View all tasks with current status and priorities
```

#### Get Specific Task
```
View detailed information for a specific task by ID
```

#### Get Next Task
```
Find the next task to work on based on dependencies and priorities
```

#### Filter by Status
```
View tasks filtered by status (pending, in-progress, done, etc.)
```

### Managing Task Status

#### Update Task Status
```
Change task status (pending → in-progress → done)
Examples:
- Set task to in-progress when starting work
- Mark task as done when completed
- Defer tasks that are postponed
```

#### Bulk Status Updates
```
Update multiple tasks at once
Example: Set multiple tasks to deferred status
```

### Task Creation and Modification

#### Add New Task
```
Create new tasks with AI assistance
- Provide description of work needed
- System generates detailed task with test strategy
- Automatically sets appropriate complexity and priority
```

#### Update Existing Task
```
Modify task details based on new information
- Update implementation details
- Adjust test strategies
- Incorporate new requirements
```

#### Remove Tasks
```
Delete tasks that are no longer needed
- Removes task and updates dependencies
- Cleans up related files
```

### Subtask Management

#### Add Subtasks
```
Break down complex tasks into smaller pieces
- Create new subtasks for detailed work
- Convert existing tasks to subtasks
- Organize work hierarchically
```

#### Update Subtasks
```
Track progress on individual subtasks
- Update subtask status independently
- Add notes and progress updates
- Maintain detailed work history
```

#### Remove Subtasks
```
Remove completed or unnecessary subtasks
- Option to convert back to standalone tasks
- Maintain clean task organization
```

### Dependency Management

#### Add Dependencies
```
Create dependency relationships between tasks
- Ensure proper work sequencing
- Prevent starting tasks before prerequisites
```

#### Remove Dependencies
```
Remove dependency relationships when no longer needed
- Unblock tasks when dependencies change
- Maintain accurate dependency graph
```

#### Validate Dependencies
```
Check for dependency issues
- Identify circular dependencies
- Find broken dependency links
- Ensure dependency graph integrity
```

## Advanced Features

### Complexity Analysis
Task Master provides AI-powered complexity analysis:

#### Automatic Scoring
- **Complexity Score**: 1-10 scale based on task requirements
- **Subtask Recommendations**: Suggested number of subtasks
- **Expansion Prompts**: AI-generated suggestions for task breakdown

#### Complexity Reports
```
Generate comprehensive complexity analysis
- Identify high-complexity tasks needing breakdown
- Recommend task expansion strategies
- Provide effort estimation guidance
```

### Task Expansion
For complex tasks (complexity 8+), use task expansion:

#### Expand Single Task
```
Break down a specific task into detailed subtasks
- AI-generated subtask breakdown
- Maintains task relationships
- Preserves original task context
```

#### Expand All Tasks
```
Automatically expand all high-complexity tasks
- Batch processing for efficiency
- Consistent subtask generation
- Maintains project coherence
```

### Project Analysis

#### Progress Tracking
- **Completion Percentages**: Overall and by category
- **Status Distribution**: Tasks by current status
- **Dependency Analysis**: Blocking and blocked tasks
- **Timeline Estimation**: Projected completion based on complexity

#### Reporting
- **Complexity Reports**: Detailed analysis of task complexity
- **Progress Reports**: Current project status and trends
- **Dependency Reports**: Dependency graph analysis
- **Performance Metrics**: Task completion rates and patterns

## Integration with MonsterBox

### MkDocs Integration
Task Master integrates seamlessly with MonsterBox documentation:

#### Automatic Updates
- **Documentation Generation**: Task information included in docs
- **Cross-References**: Links between tasks and documentation
- **Search Integration**: Task content searchable in docs
- **Version Control**: Documentation updates with task changes

#### Content Coordination
- **No Duplication**: Task docs complement existing documentation
- **Consistent Terminology**: Standardized language across all docs
- **Proper Navigation**: Task docs integrated into MkDocs navigation
- **Theme Consistency**: Maintains Material theme styling

### Development Workflow
Task Master supports the complete development workflow:

#### Planning Phase
- **PRD Processing**: Generate tasks from requirements documents
- **Dependency Mapping**: Identify task relationships
- **Priority Setting**: Establish work priorities
- **Resource Planning**: Estimate effort and timeline

#### Execution Phase
- **Work Coordination**: Track active work across team
- **Progress Monitoring**: Real-time status updates
- **Blocker Resolution**: Identify and resolve blocking issues
- **Quality Assurance**: Ensure completion criteria are met

#### Review Phase
- **Completion Verification**: Validate all task requirements met
- **Documentation Updates**: Ensure docs reflect completed work
- **Lessons Learned**: Capture insights for future work
- **Process Improvement**: Refine workflows based on experience

## Best Practices

### Task Creation
- **Clear Titles**: Use descriptive, action-oriented titles
- **Detailed Descriptions**: Include context and requirements
- **Specific Acceptance Criteria**: Define what "done" means
- **Comprehensive Test Strategy**: Plan testing approach upfront

### Task Management
- **Regular Updates**: Update status frequently (daily minimum)
- **Dependency Awareness**: Consider impact on other tasks
- **Documentation**: Keep task details current and accurate
- **Communication**: Coordinate with team on shared work

### Quality Assurance
- **Test Strategy Compliance**: Follow defined testing approach
- **Code Review**: Get peer review for all implementations
- **Documentation Updates**: Update docs with all changes
- **Completion Verification**: Ensure all criteria met before marking done

## Troubleshooting

### Common Issues

#### Dependency Conflicts
- **Circular Dependencies**: Use dependency validation to identify
- **Broken Links**: Remove dependencies to deleted tasks
- **Blocking Chains**: Identify and resolve long dependency chains

#### Task Organization
- **Overwhelming Complexity**: Break down high-complexity tasks
- **Unclear Requirements**: Update task details with more specificity
- **Priority Conflicts**: Reassess and adjust task priorities

#### Integration Issues
- **Documentation Sync**: Ensure docs reflect current task state
- **Search Problems**: Verify task content included in search index
- **Navigation Issues**: Check MkDocs navigation configuration

### Getting Help
- **Documentation**: Refer to this guide and related documentation
- **Team Coordination**: Discuss issues in team meetings
- **Process Improvement**: Suggest improvements to task management process
- **Tool Updates**: Keep Task Master and related tools current

---

*For workflow-specific guidance, see [Task Workflows](task-workflows.md) and [Development Process](development-process.md).*
