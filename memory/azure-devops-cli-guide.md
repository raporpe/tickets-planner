# Azure DevOps CLI Guide for Work Item Management

This guide documents empirically verified commands for managing Azure DevOps work items using the `az` CLI.

## Prerequisites

```bash
# Check Azure CLI is installed
az --version

# Check you're logged in
az account show

# Verify Azure DevOps extension is installed
az extension show --name azure-devops

# If not installed:
az extension add --name azure-devops
```

## Key Concepts

### Organization URL Format
- Visual Studio format: `https://msasg.visualstudio.com`
- Modern format: `https://dev.azure.com/your-org`

### Work Item Hierarchy (typical)
```
Epic
└── Feature
    └── User Story
        └── Task / Bug
```

## Reading Work Items

### Get work item details
```bash
az boards work-item show \
  --id <WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  --query "{id:id,title:fields.\"System.Title\",type:fields.\"System.WorkItemType\",parent:fields.\"System.Parent\"}" \
  -o json
```

### Get area and iteration paths
```bash
az boards work-item show \
  --id <WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  --query "{areaPath:fields.\"System.AreaPath\",iterationPath:fields.\"System.IterationPath\"}" \
  -o json
```

### Check relations (parent/child links)
```bash
az boards work-item show \
  --id <WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  --query "{id:id,relations:relations[].{rel:rel,url:url}}" \
  -o json
```

## Creating Work Items

### Basic creation
```bash
az boards work-item create \
  --org https://msasg.visualstudio.com \
  --project "Project Name" \
  --type "Task" \
  --title "Work item title" \
  --description "Description with <br> for line breaks" \
  --query "{id:id}" -o json
```

### With area and iteration paths
```bash
az boards work-item create \
  --org https://msasg.visualstudio.com \
  --project "Project Name" \
  --type "User Story" \
  --title "My User Story" \
  --description "Description here" \
  --area "Project Name\\Team\\Area" \
  --iteration "Project Name\\Sprint" \
  --query "{id:id}" -o json
```

### Work item types
Common types (varies by process template):
- `Epic`
- `Feature`
- `User Story`
- `Task`
- `Bug`

## Setting Parent-Child Relationships

> ⚠️ **IMPORTANT**: Do NOT use `--fields "System.Parent=X"` - this does NOT work!

### ✅ Correct method: Use `relation add`
```bash
az boards work-item relation add \
  --id <CHILD_WORK_ITEM_ID> \
  --relation-type parent \
  --target-id <PARENT_WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  -o none
```

### List available relation types
```bash
az boards work-item relation list-type --org https://msasg.visualstudio.com
```

Common relation types:
- `parent` - Set parent of current work item
- `child` - Add child to current work item

### Remove a relation
```bash
az boards work-item relation remove \
  --id <WORK_ITEM_ID> \
  --relation-type parent \
  --target-id <TARGET_ID> \
  --org https://msasg.visualstudio.com
```

## Updating Work Items

### Update fields
```bash
az boards work-item update \
  --id <WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  --title "New title" \
  --description "New description" \
  -o none
```

### Update state
```bash
az boards work-item update \
  --id <WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  --state "Active" \
  -o none
```

## Adding Comments

Use the `--discussion` flag to add comments to a work item's discussion thread:

```bash
az boards work-item update \
  --id <WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  --discussion "This is a comment added via CLI" \
  -o none
```

### Add comment with HTML formatting
```bash
az boards work-item update \
  --id <WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  --discussion "Update:<br>- Item 1<br>- Item 2<br><strong>Done!</strong>" \
  -o none
```

### Add comments in batch
```bash
az boards work-item update --id 123 --org https://msasg.visualstudio.com --discussion "Comment 1" -o none &
az boards work-item update --id 124 --org https://msasg.visualstudio.com --discussion "Comment 2" -o none &
az boards work-item update --id 125 --org https://msasg.visualstudio.com --discussion "Comment 3" -o none &
wait
```

## Deleting Work Items

```bash
az boards work-item delete \
  --id <WORK_ITEM_ID> \
  --org https://msasg.visualstudio.com \
  --yes \
  -o none
```

## Batch Operations

### Create multiple work items efficiently
Run commands in parallel using `&` and `wait`:

```bash
az boards work-item create --org https://msasg.visualstudio.com --project "Project" --type "Task" --title "Task 1" --query "id" -o tsv &
az boards work-item create --org https://msasg.visualstudio.com --project "Project" --type "Task" --title "Task 2" --query "id" -o tsv &
az boards work-item create --org https://msasg.visualstudio.com --project "Project" --type "Task" --title "Task 3" --query "id" -o tsv &
wait
```

### Add parent relations in batch
```bash
az boards work-item relation add --id 123 --relation-type parent --target-id 100 --org https://msasg.visualstudio.com -o none &
az boards work-item relation add --id 124 --relation-type parent --target-id 100 --org https://msasg.visualstudio.com -o none &
az boards work-item relation add --id 125 --relation-type parent --target-id 100 --org https://msasg.visualstudio.com -o none &
wait
```

## Common Patterns

### Create a User Story with child Tasks
```bash
# 1. Create the User Story
STORY_ID=$(az boards work-item create \
  --org https://msasg.visualstudio.com \
  --project "Project Name" \
  --type "User Story" \
  --title "My User Story" \
  --area "Project\\Team\\Area" \
  --iteration "Project\\Sprint" \
  --query "id" -o tsv)

# 2. Create Tasks
TASK1_ID=$(az boards work-item create --org https://msasg.visualstudio.com --project "Project Name" --type "Task" --title "Task 1" --query "id" -o tsv)
TASK2_ID=$(az boards work-item create --org https://msasg.visualstudio.com --project "Project Name" --type "Task" --title "Task 2" --query "id" -o tsv)

# 3. Link Tasks to User Story (MUST use relation add, not --fields)
az boards work-item relation add --id $TASK1_ID --relation-type parent --target-id $STORY_ID --org https://msasg.visualstudio.com -o none
az boards work-item relation add --id $TASK2_ID --relation-type parent --target-id $STORY_ID --org https://msasg.visualstudio.com -o none
```

### Link User Story to existing Epic/Feature
```bash
az boards work-item relation add \
  --id <USER_STORY_ID> \
  --relation-type parent \
  --target-id <EPIC_OR_FEATURE_ID> \
  --org https://msasg.visualstudio.com \
  -o none
```

## Output Formatting Tips

- `-o json` - Full JSON output
- `-o tsv` - Tab-separated values (good for capturing IDs)
- `-o none` - Suppress output (good for batch operations)
- `--query` - JMESPath query to filter output

### Useful queries
```bash
# Get just the ID
--query "id" -o tsv

# Get ID and URL
--query "{id:id,url:url}" -o json

# Get specific fields
--query "{id:id,title:fields.\"System.Title\",state:fields.\"System.State\"}" -o json
```

## Troubleshooting

### "System.Parent field not found"
Don't use `--fields "System.Parent=X"`. Use `az boards work-item relation add` instead.

### Relations not appearing
After creating work items with `--fields "System.Parent=X"`, the parent won't be set. You must use `relation add` as a separate command.

### Check if relation exists
```bash
az boards work-item show --id <ID> --org <ORG> --query "relations" -o json
```
If `null`, no relations exist.
