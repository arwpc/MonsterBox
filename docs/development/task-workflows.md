# Task Workflows

## Overview

This guide describes the standard workflows for managing tasks in the MonsterBox project using Task Master. These workflows ensure consistent development practices and proper coordination across all team members.

## Task Lifecycle

### 1. Task Creation
Tasks can be created in several ways:

#### From PRD (Recommended)
```
1. Update the PRD document (.taskmaster/docs/prd.txt)
2. Run PRD parsing to generate tasks automatically
3. Review and adjust generated tasks as needed
```

#### Manual Task Creation
```
1. Identify new work that needs to be done
2. Create task with clear title and description
3. Set appropriate priority and dependencies
4. Add detailed implementation steps
5. Define test strategy
```

### 2. Task Planning
Before starting work on any task:

#### Dependency Check
- Verify all dependency tasks are completed
- Identify any blocking issues
- Coordinate with team members on shared dependencies

#### Complexity Assessment
- Review AI-generated complexity score
- Break down high-complexity tasks (8+) into subtasks
- Estimate effort and timeline

#### Resource Allocation
- Assign task to appropriate team member
- Ensure required skills and knowledge are available
- Plan for any needed training or research

### 3. Task Execution

#### Starting a Task
1. **Update Status**: Change from "pending" to "in-progress"
2. **Review Requirements**: Read all task details and test strategy
3. **Plan Implementation**: Break down work into daily/weekly milestones
4. **Set Up Environment**: Ensure all tools and dependencies are ready

#### During Development
1. **Regular Updates**: Update task progress and any blockers
2. **Subtask Management**: Complete subtasks and update their status
3. **Documentation**: Document findings, decisions, and changes
4. **Testing**: Implement tests as defined in test strategy

#### Completing a Task
1. **Final Testing**: Ensure all test criteria are met
2. **Code Review**: Get peer review for all changes
3. **Documentation Update**: Update relevant documentation
4. **Status Update**: Change status to "done"
5. **Handoff**: Notify dependent tasks that they can proceed

## Common Workflow Patterns

### Feature Development Workflow
```
1. Create feature task from requirements
2. Break down into subtasks:
   - Design/Architecture
   - Implementation
   - Testing
   - Documentation
3. Execute subtasks in sequence
4. Integration testing
5. Feature completion and handoff
```

### Bug Fix Workflow
```
1. Create bug task with reproduction steps
2. Investigate and identify root cause
3. Implement fix with tests
4. Verify fix resolves issue
5. Update documentation if needed
6. Close task and notify stakeholders
```

### Research/Investigation Workflow
```
1. Create research task with clear objectives
2. Define success criteria and deliverables
3. Conduct research and document findings
4. Present recommendations
5. Create follow-up implementation tasks if needed
```

## Task Prioritization Guidelines

### High Priority
- **Critical bugs** affecting production systems
- **Security vulnerabilities** requiring immediate attention
- **Blocking dependencies** for other high-priority work
- **Foundation tasks** that enable other development

### Medium Priority
- **Feature enhancements** that improve user experience
- **Performance optimizations** with measurable impact
- **Technical debt** that affects maintainability
- **Documentation updates** for new features

### Low Priority
- **Nice-to-have features** with limited impact
- **Experimental work** for future consideration
- **Cleanup tasks** that don't affect functionality
- **Long-term optimizations** without immediate need

## Status Management

### Status Definitions
- **Pending**: Task is ready to start but not yet begun
- **In-Progress**: Task is actively being worked on
- **Done**: Task is completed and verified
- **Deferred**: Task is postponed to a later time
- **Cancelled**: Task is no longer needed or relevant
- **Blocked**: Task cannot proceed due to dependencies

### Status Transitions
```
Pending → In-Progress → Done
Pending → Deferred → In-Progress → Done
Pending → Cancelled
In-Progress → Blocked → In-Progress → Done
```

## Dependency Management

### Types of Dependencies
1. **Technical Dependencies**: Code/system requirements
2. **Resource Dependencies**: People or tools needed
3. **Knowledge Dependencies**: Information or training required
4. **External Dependencies**: Third-party services or approvals

### Managing Dependencies
- **Identify Early**: Map dependencies during task planning
- **Communicate**: Keep dependent tasks informed of progress
- **Parallel Work**: Find ways to work on independent parts
- **Risk Mitigation**: Have backup plans for critical dependencies

## Team Coordination

### Daily Standups
- Review active tasks and progress
- Identify blockers and dependencies
- Coordinate shared work and resources
- Plan daily priorities

### Weekly Planning
- Review completed tasks and lessons learned
- Plan upcoming work and priorities
- Adjust timelines based on progress
- Identify resource needs and training

### Sprint/Milestone Reviews
- Assess overall project progress
- Update task priorities based on changing requirements
- Plan next sprint/milestone objectives
- Celebrate completed work and achievements

## Best Practices

### Task Creation
- Use clear, descriptive titles
- Include detailed acceptance criteria
- Define comprehensive test strategies
- Set realistic complexity estimates

### Task Execution
- Update status regularly (at least daily)
- Document decisions and changes
- Ask for help when blocked
- Test thoroughly before marking complete

### Team Collaboration
- Communicate early and often
- Share knowledge and learnings
- Help unblock teammates
- Maintain shared understanding of goals

---

*For detailed Task Master commands and usage, see the [Task Master Guide](taskmaster-guide.md).*
