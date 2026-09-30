# Mermail Skill: Email Task Extractor

## Description
The **Email Task Extractor** is an intelligent Model Context Protocol (MCP) skill designed for Mermail. It automatically parses incoming email threads, extracts actionable items, assigns priority levels (High, Medium, Low), and detects deadlines to streamline personal and team productivity directly inside your mail workflow.

## How it Integrates with Mermail
Mermail utilizes MCP to connect AI agents with email communication tools. This skill registers as an MCP tool (`extract_tasks_from_email`) that the Mermail agent can invoke whenever a new email arrives or when requested by the user.

## Workflow (Step-by-Step)
1. **Trigger:** A new email is received in Mermail, or the user requests task extraction for a specific thread.
2. **MCP Request:** Mermail calls the `extract_tasks_from_email` tool passing the email body as `emailText`.
3. **Analysis:** The tool parses the text content, identifying action items, timelines, and importance cues.
4. **Structured Output:** Returns a structured JSON payload containing tasks, priorities, and deadlines back to the Mermail agent for display or synchronization with task managers.

## Example Prompts & Usage
- *"Hey Mermail, extract all tasks and deadlines from this email from my manager."*
- *"Analyze the latest client thread and create a priority to-do list."*

### Example JSON Output
```json
{
  "success": true,
  "extractedTasks": [
    {
      "title": "Review Q3 financial report",
      "priority": "High",
      "deadline": "Tomorrow, 5 PM",
      "assignee": "Team"
    }
  ]
}
```
