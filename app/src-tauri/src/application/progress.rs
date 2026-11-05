use serde::Serialize;
use serde_json::{json, Value};
use std::time::Instant;

#[derive(Clone, Serialize)]
pub struct ProgressStep {
    pub id: &'static str,
    pub label: &'static str,
    #[serde(skip_serializing)]
    pub headline: &'static str,
    pub state: &'static str,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ms: Option<u64>,
}

#[derive(Clone, Serialize)]
pub struct Progress {
    pub active: bool,
    pub title: String,
    pub detail: String,
    pub steps: Vec<ProgressStep>,
}

fn default_steps(project: &str) -> Vec<ProgressStep> {
    vec![
        ProgressStep {
            id: "auth",
            label: "Azure CLI session",
            headline: "Signing in to Azure DevOps",
            state: "active",
            detail: format!("Acquiring Azure CLI token for {project}…"),
            ms: None,
        },
        ProgressStep {
            id: "sprints",
            label: "Sprint schedule",
            headline: "Loading sprint schedule",
            state: "pending",
            detail: format!("Waiting to read {project}\\Sprint iterations"),
            ms: None,
        },
        ProgressStep {
            id: "board",
            label: "Features board & states",
            headline: "Loading Features board & workflow",
            state: "pending",
            detail: "Columns, board Features & state mappings".into(),
            ms: None,
        },
        ProgressStep {
            id: "wiql",
            label: "Assigned work items",
            headline: "Querying assigned work items",
            state: "pending",
            detail: "Tasks, Bugs & User Stories assigned to you".into(),
            ms: None,
        },
        ProgressStep {
            id: "items",
            label: "Ticket fields & relations",
            headline: "Hydrating ticket fields & links",
            state: "pending",
            detail: "Batch-fetching work items & artifact links".into(),
            ms: None,
        },
        ProgressStep {
            id: "hierarchy",
            label: "Epic › Feature › Story chains",
            headline: "Walking Epic › Feature › Story hierarchy",
            state: "pending",
            detail: "Resolving parent chains & board Features".into(),
            ms: None,
        },
    ]
}

impl Progress {
    pub fn new(project: &str) -> Self {
        let steps = default_steps(project);
        Self {
            active: true,
            title: steps[0].headline.into(),
            detail: steps[0].detail.clone(),
            steps,
        }
    }

    pub fn reset(&mut self, project: &str, preserve_auth: bool) {
        let saved_auth = if preserve_auth {
            self.steps.first().filter(|s| s.state == "done").cloned()
        } else {
            None
        };
        *self = Self::new(project);
        if let Some(done_auth) = saved_auth {
            self.steps[0] = done_auth;
        }
        self.sync_headline();
    }

    pub fn step_active(&mut self, step_id: &'static str, detail: impl Into<String>) {
        let detail = detail.into();
        self.active = true;
        if let Some(step) = self.steps.iter_mut().find(|s| s.id == step_id) {
            step.state = "active";
            step.detail = detail.clone();
            self.title = step.headline.into();
            self.detail = detail;
        }
    }

    pub fn step_done(&mut self, step_id: &'static str, detail: impl Into<String>, started: Instant) {
        let detail = detail.into();
        if let Some(step) = self.steps.iter_mut().find(|s| s.id == step_id) {
            step.state = "done";
            step.detail = detail;
            step.ms = Some(started.elapsed().as_millis() as u64);
        }
        self.sync_headline();
    }

    pub fn finish(&mut self) {
        self.active = false;
    }

    pub fn snapshot(&self) -> Value {
        json!(self)
    }

    fn sync_headline(&mut self) {
        if let Some(step) = self
            .steps
            .iter()
            .rev()
            .find(|s| s.state == "active")
            .or_else(|| self.steps.iter().rev().find(|s| s.state == "done"))
        {
            self.title = step.headline.into();
            self.detail = step.detail.clone();
        }
    }
}
