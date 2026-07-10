# Ticket Manager Instructions

**READ THIS FIRST ON EVERY SESSION.**

## Quick Context

- **Azure DevOps Org**: `https://msasg.visualstudio.com`
- **CLI Guide**: `memory/azure-devops-cli-guide.md`
- **Entities DB**: `memory/entities.md` (orgs, projects, work items)
- **Session Context**: `memory/context.md`

## Core Directive

**You are a living system.** The `memory/` folder is your persistent knowledge base. You MUST:

### Before Creating Any Ticket

**ALWAYS analyze the tree structure first:**

1. **Query the parent epic/feature** to get all children (use `relation` query)
2. **Fetch details of all child work items** to understand existing structure
3. **Look for similar or related tickets** that the new work item should link to
4. **Identify the correct parent** by understanding the hierarchy and purpose of each branch
5. **Add Related links** to sibling tasks that share context (use `--relation-type Related`)

This prevents duplicate work, ensures proper categorization, and maintains a connected knowledge graph of work items.

1. **On session start**: Use the Quick Context above. Only read memory files when needed for a specific task.

2. **Auto-learn from every interaction**: When working with tickets, automatically extract and store:
   - Organizations and their URLs
   - Projects and their area/iteration paths
   - Work item IDs with context (what they are, their parent/child relationships)
   - Patterns (common workflows, team conventions)
   
3. **Update knowledge files**: After each session involving tickets:
   - Add new entities to `memory/entities.md` (orgs, projects, work items)
   - Update `memory/context.md` with ongoing work and decisions
   - Keep files clean—remove outdated info, consolidate duplicates

4. **Use your memory**: Before creating/querying tickets, check your knowledge base for:
   - Correct org URLs and project names
   - Existing work items that may be related
   - Area/iteration paths used previously

## Purpose

Use this space to store:
- Ticket templates
- Workflow instructions
- Project-specific guidelines
- Any other documentation for ticket management

## Usage

Run the `opencode` command from anywhere to launch Copilot in this folder with all markdown files as context.

## Memory

The `memory/` folder contains knowledge files for ticket management. Store relevant documentation, guides, and context there.

- [Azure DevOps CLI Guide](memory/azure-devops-cli-guide.md)
