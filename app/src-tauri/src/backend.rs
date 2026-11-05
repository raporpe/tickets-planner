use crate::auth::Auth;
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, Duration, Utc};
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    env,
    sync::{Arc, LazyLock, Mutex},
    time::{Duration as Timeout, Instant},
};
use url::Url;

const COLUMN: &str = "WEF_9DB34C125FE94EC5BED3AB6B1B826B4C_Kanban.Column";
const LANE: &str = "WEF_9DB34C125FE94EC5BED3AB6B1B826B4C_Kanban.Lane";
const TYPES: [&str; 3] = ["Task", "Bug", "User Story"];
const RICH: [&str; 3] = [
    "System.Description",
    "Microsoft.VSTS.TCM.ReproSteps",
    "Microsoft.VSTS.Common.AcceptanceCriteria",
];
const COMMENTS_API: &str = "7.1-preview.4";
static PR_ARTIFACT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^vstfs:///Git/PullRequestId/([^%/]+)(?:%2F|/)([^%/]+)(?:%2F|/)(\d+)$").unwrap()
});

#[derive(Debug, Serialize)]
pub struct Error {
    pub status: u16,
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub fn new(status: u16, error: impl Into<String>) -> Self {
        Self {
            status,
            error: error.into(),
            code: None,
        }
    }
    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code = Some(code.into());
        self
    }
}
impl From<reqwest::Error> for Error {
    fn from(error: reqwest::Error) -> Self {
        Self::new(502, format!("Network request failed: {error}"))
    }
}
impl From<serde_json::Error> for Error {
    fn from(error: serde_json::Error) -> Self {
        Self::new(502, format!("Invalid API response: {error}"))
    }
}

#[derive(Clone, Serialize)]
struct ProgressStep {
    id: &'static str,
    label: &'static str,
    #[serde(skip_serializing)]
    headline: &'static str,
    state: &'static str,
    detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    ms: Option<u64>,
}

#[derive(Clone, Serialize)]
struct Progress {
    active: bool,
    title: String,
    detail: String,
    steps: Vec<ProgressStep>,
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
    fn new(project: &str) -> Self {
        let steps = default_steps(project);
        Self {
            active: true,
            title: steps[0].headline.into(),
            detail: steps[0].detail.clone(),
            steps,
        }
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

pub struct Backend {
    client: reqwest::Client,
    auth: Arc<Auth>,
    org: String,
    project: String,
    team: String,
    sprint_root: String,
    progress: Mutex<Progress>,
    nodes: Mutex<HashMap<u64, (Value, Option<u64>)>>,
}

fn enc(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
}
fn text(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}
fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}
fn id(wi: &Value) -> u64 {
    wi["id"].as_u64().unwrap_or(0)
}
fn parent(wi: &Value) -> Option<u64> {
    array(&wi["relations"])
        .iter()
        .find(|r| r["rel"] == "System.LinkTypes.Hierarchy-Reverse")
        .and_then(|r| text(&r["url"]).rsplit('/').next()?.parse().ok())
}
fn children(wi: &Value) -> Vec<u64> {
    array(&wi["relations"])
        .iter()
        .filter(|r| r["rel"] == "System.LinkTypes.Hierarchy-Forward")
        .filter_map(|r| text(&r["url"]).rsplit('/').next()?.parse().ok())
        .collect()
}
fn tags(fields: &Value) -> Vec<&str> {
    text(&fields["System.Tags"])
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect()
}
fn person(value: &Value) -> Value {
    if value.is_null() {
        Value::Null
    } else {
        json!({"id":value["id"],"name":value["displayName"],"email":value["uniqueName"]})
    }
}
fn comment(value: &Value) -> Value {
    json!({
        "id":value["id"],"text":text(&value["text"]),
        "format":value["format"].as_str().unwrap_or("html").to_lowercase(),
        "version":value["version"],"createdBy":person(&value["createdBy"]),
        "createdDate":value["createdDate"],"modifiedDate":value["modifiedDate"]
    })
}
fn done(state: &Value) -> bool {
    matches!(
        text(state),
        "Closed" | "Done" | "Removed" | "Resolved" | "Shipped"
    )
}
fn positive_id(value: &str) -> Result<u64> {
    value
        .parse::<u64>()
        .ok()
        .filter(|v| *v > 0)
        .ok_or_else(|| Error::new(400, "Invalid work item ID"))
}
fn required<'a>(body: &'a Value, key: &str) -> Result<&'a str> {
    body[key]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::new(400, format!("{key} is empty")))
}
fn add(ops: &mut Vec<Value>, path: impl Into<String>, value: impl Into<Value>) {
    ops.push(json!({"op":"add","path":path.into(),"value":value.into()}));
}
fn test_revision(ops: &mut Vec<Value>, rev: &Value) {
    if !rev.is_null() {
        ops.push(json!({"op":"test","path":"/rev","value":rev}));
    }
}
async fn join_all<T>(futures: Vec<impl std::future::Future<Output = T>>) -> Vec<T> {
    let mut pinned: Vec<_> = futures.into_iter().map(|f| Box::pin(f)).collect();
    let mut results: Vec<Option<T>> = (0..pinned.len()).map(|_| None).collect();
    std::future::poll_fn(|cx| {
        let mut all_done = true;
        for (i, fut) in pinned.iter_mut().enumerate() {
            if results[i].is_none() {
                match fut.as_mut().poll(cx) {
                    std::task::Poll::Ready(val) => results[i] = Some(val),
                    std::task::Poll::Pending => all_done = false,
                }
            }
        }
        if all_done {
            std::task::Poll::Ready(results.iter_mut().filter_map(Option::take).collect())
        } else {
            std::task::Poll::Pending
        }
    })
    .await
}

impl Backend {
    pub fn new() -> Result<Self> {
        let org = env::var("ADO_ORG")
            .unwrap_or_else(|_| "https://msasg.visualstudio.com".into())
            .trim_end_matches('/')
            .to_owned();
        let parsed =
            Url::parse(&org).map_err(|_| Error::new(400, "ADO_ORG must be a valid HTTPS URL"))?;
        if parsed.scheme() != "https"
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.query().is_some()
            || parsed.fragment().is_some()
        {
            return Err(Error::new(
                400,
                "ADO_ORG must be an HTTPS organization URL without credentials, query, or fragment",
            ));
        }
        let client = reqwest::Client::builder()
            .timeout(Timeout::from_secs(60))
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        let project = env::var("ADO_PROJECT").unwrap_or_else(|_| "SAN SA".into());
        Ok(Self {
            auth: Arc::new(Auth::new(client.clone())?),
            client,
            org,
            progress: Mutex::new(Progress::new(&project)),
            nodes: Mutex::new(HashMap::new()),
            project,
            team: env::var("ADO_TEAM_ID")
                .unwrap_or_else(|_| "4271a5b2-919a-44ce-a87d-ef4c4d823a21".into()),
            sprint_root: env::var("ADO_SPRINT_ROOT").unwrap_or_else(|_| "Sprint".into()),
        })
    }
    fn remember_node(&self, wi: &Value) {
        let wid = id(wi);
        if wid > 0 {
            self.nodes
                .lock()
                .unwrap()
                .insert(wid, (self.summary(wi), parent(wi)));
        }
    }
    fn begin_progress(&self, preserve_auth: bool) {
        let mut p = self.progress.lock().unwrap();
        let saved_auth = if preserve_auth {
            p.steps.first().filter(|s| s.state == "done").cloned()
        } else {
            None
        };
        *p = Progress::new(&self.project);
        if let Some(done_auth) = saved_auth {
            p.steps[0] = done_auth;
        }
        p.sync_headline();
    }
    fn step_active(&self, step_id: &'static str, detail: impl Into<String>) {
        let detail = detail.into();
        let mut p = self.progress.lock().unwrap();
        p.active = true;
        if let Some(step) = p.steps.iter_mut().find(|s| s.id == step_id) {
            step.state = "active";
            step.detail = detail.clone();
            p.title = step.headline.into();
            p.detail = detail;
        }
    }
    fn step_done(&self, step_id: &'static str, detail: impl Into<String>, started: Instant) {
        let detail = detail.into();
        let mut p = self.progress.lock().unwrap();
        if let Some(step) = p.steps.iter_mut().find(|s| s.id == step_id) {
            step.state = "done";
            step.detail = detail;
            step.ms = Some(started.elapsed().as_millis() as u64);
        }
        p.sync_headline();
    }
    fn finish_progress(&self) {
        self.progress.lock().unwrap().active = false;
    }
    fn progress_snapshot(&self) -> Value {
        json!(&*self.progress.lock().unwrap())
    }
    fn p(&self) -> String {
        enc(&self.project)
    }
    fn backlog(&self) -> String {
        format!("{}\\{}", self.project, self.sprint_root)
    }
    fn edit_url(&self, id: u64) -> String {
        format!("{}/{}/_workitems/edit/{id}", self.org, self.p())
    }

    async fn ado(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
        patch: bool,
    ) -> Result<Value> {
        let url = format!("{}{path}", self.org);
        let token = self.auth.token().await?;
        let method = reqwest::Method::from_bytes(method.as_bytes())
            .map_err(|_| Error::new(400, "Invalid HTTP method"))?;
        let mut request = self
            .client
            .request(method, &url)
            .bearer_auth(token)
            .header("Accept", "application/json");
        if let Some(body) = body {
            request = request
                .header(
                    "Content-Type",
                    if patch {
                        "application/json-patch+json"
                    } else {
                        "application/json"
                    },
                )
                .json(&body);
        }
        let response = request.send().await?;
        let status = response.status().as_u16();
        let body = response.text().await?;
        if matches!(status, 203 | 401) {
            self.auth.invalidate().await;
            return Err(Error::new(
                401,
                "Azure DevOps rejected the token. Sign in again.",
            ));
        }
        if !(200..300).contains(&status) {
            let message = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| v["message"].as_str().map(str::to_owned))
                .unwrap_or(body);
            return Err(Error::new(
                status,
                format!(
                    "Azure DevOps request failed ({status}): {}",
                    message.chars().take(400).collect::<String>()
                ),
            ));
        }
        if body.is_empty() {
            Ok(Value::Null)
        } else {
            Ok(serde_json::from_str(&body)?)
        }
    }
    async fn get(&self, path: &str) -> Result<Value> {
        self.ado("GET", path, None, false).await
    }
    async fn patch(&self, id: u64, ops: Vec<Value>) -> Result<Value> {
        self.ado(
            "PATCH",
            &format!("/_apis/wit/workitems/{id}?api-version=7.1"),
            Some(json!(ops)),
            true,
        )
        .await
    }
    async fn workitem(&self, id: u64) -> Result<Value> {
        self.get(&format!(
            "/_apis/wit/workitems/{id}?$expand=relations&api-version=7.1"
        ))
        .await
    }
    async fn items(
        &self,
        ids: &[u64],
        relations: bool,
        fields: Option<Vec<&str>>,
    ) -> Result<Vec<Value>> {
        self.items_tracked(ids, relations, fields, None).await
    }
    async fn items_tracked(
        &self,
        ids: &[u64],
        relations: bool,
        fields: Option<Vec<&str>>,
        progress_step: Option<&'static str>,
    ) -> Result<Vec<Value>> {
        let mut seen = HashSet::new();
        let unique: Vec<u64> = ids.iter().copied().filter(|id| seen.insert(*id)).collect();
        let total = unique.len();
        let chunks: Vec<&[u64]> = unique.chunks(200).collect();
        let chunk_count = chunks.len();
        let mut out = Vec::new();
        for (idx, chunk) in chunks.into_iter().enumerate() {
            if let Some(step_id) = progress_step {
                if chunk_count > 1 {
                    self.step_active(
                        step_id,
                        format!(
                            "Batch {}/{chunk_count} · loading {} of {total} tickets…",
                            idx + 1,
                            (out.len() + chunk.len()).min(total)
                        ),
                    );
                }
            }
            let mut body = json!({"ids":chunk,"errorPolicy":"omit"});
            if relations {
                body["$expand"] = json!("relations");
            } else if let Some(fields) = &fields {
                body["fields"] = json!(fields);
            }
            let value = self
                .ado(
                    "POST",
                    &format!("/{}/_apis/wit/workitemsbatch?api-version=7.1", self.p()),
                    Some(body),
                    false,
                )
                .await?;
            out.extend(
                array(&value["value"])
                    .iter()
                    .filter(|v| !v.is_null())
                    .cloned(),
            );
        }
        Ok(out)
    }

    async fn sprints(&self) -> Result<Value> {
        let node_path = format!(
            "/{}/_apis/wit/classificationnodes/Iterations/{}?$depth=1&api-version=7.1",
            self.p(),
            enc(&self.sprint_root)
        );
        let team_path = format!(
            "/{}/{}/_apis/work/teamsettings/iterations?api-version=7.1",
            self.p(),
            enc(&self.team)
        );
        let (node, team) = tokio::try_join!(self.get(&node_path), self.get(&team_path))?;
        let subscribed: HashSet<&str> = array(&team["value"])
            .iter()
            .map(|t| text(&t["id"]))
            .collect();
        let mut sprints: Vec<Value> = array(&node["children"]).iter().map(|c| json!({
            "identifier":c["identifier"],"name":c["name"],
            "path":format!("{}\\{}",self.backlog(),text(&c["name"])),
            "start":c["attributes"]["startDate"],"finish":c["attributes"]["finishDate"],
            "subscribed":subscribed.contains(text(&c["identifier"])),
            "timeFrame":time_frame(&c["attributes"]["startDate"], &c["attributes"]["finishDate"])
        })).collect();
        sprints.sort_by(|a, b| text(&a["start"]).cmp(text(&b["start"])));
        Ok(json!(sprints))
    }
    async fn feature_columns(&self) -> Result<Value> {
        let columns = self
            .get(&format!(
                "/{}/{}/_apis/work/boards/Features/columns?api-version=7.1",
                self.p(),
                enc(&self.team)
            ))
            .await?;
        Ok(json!(array(&columns["value"])
            .iter()
            .map(|c| json!({
                "name":c["name"],"state":c["stateMappings"]["Feature"],"type":c["columnType"]
            }))
            .collect::<Vec<_>>()))
    }
    fn is_on_board(&self, wi: &Value, board_set: &HashSet<u64>) -> bool {
        if board_set.contains(&id(wi)) {
            return true;
        }
        let f = &wi["fields"];
        if text(&f["System.State"]) == "Removed" {
            return false;
        }
        let area = text(&f["System.AreaPath"]);
        let iter = text(&f["System.IterationPath"]);
        let in_area = area == self.project
            || area
                .strip_prefix(&self.project)
                .is_some_and(|rest| rest.starts_with('\\'));
        let backlog = self.backlog();
        let in_iter = iter == backlog
            || iter
                .strip_prefix(&backlog)
                .is_some_and(|rest| rest.starts_with('\\'));
        in_area && in_iter
    }
    fn feature(&self, wi: &Value, on_board: bool, columns: &Value) -> Value {
        let f = &wi["fields"];
        let state = text(&f["System.State"]);
        let col_list = array(columns);
        let boundary_col = col_list
            .iter()
            .find(|c| matches!(text(&c["type"]), "incoming" | "outgoing") && text(&c["state"]) == state)
            .and_then(|c| c["name"].as_str());
        let raw_col = f[COLUMN].as_str().filter(|s| !s.is_empty());
        let fallback_col = col_list
            .iter()
            .find(|c| text(&c["state"]) == state)
            .and_then(|c| c["name"].as_str());
        let column = boundary_col.or(raw_col).or(fallback_col);
        json!({
            "id":wi["id"],"title":f["System.Title"],"state":f["System.State"],
            "column":column,"lane":f[LANE],"iterationPath":f["System.IterationPath"],"areaPath":f["System.AreaPath"],
            "owner":f["System.AssignedTo"]["displayName"],"onBoard":on_board,"url":self.edit_url(id(wi))
        })
    }
    fn summary(&self, wi: &Value) -> Value {
        let f = &wi["fields"];
        json!({"id":wi["id"],"title":f["System.Title"],"type":f["System.WorkItemType"],"state":f["System.State"],
            "iterationPath":f["System.IterationPath"],"url":self.edit_url(id(wi))})
    }
    async fn states(&self) -> Result<Value> {
        let fetch = |t: &'static str| async move {
            let v = self
                .get(&format!(
                    "/{}/_apis/wit/workitemtypes/{}/states?api-version=7.1",
                    self.p(),
                    enc(t)
                ))
                .await?;
            Ok::<_, Error>(json!(array(&v["value"])
                .iter()
                .map(|s| s["name"].clone())
                .collect::<Vec<_>>()))
        };
        let (task, bug, story) =
            tokio::try_join!(fetch("Task"), fetch("Bug"), fetch("User Story"))?;
        Ok(json!({"Task":task,"Bug":bug,"User Story":story}))
    }

    async fn overview(&self) -> Result<Value> {
        self.begin_progress(true);
        let result = self.build_overview().await;
        self.finish_progress();
        result
    }

    async fn build_overview(&self) -> Result<Value> {
        let wiql_path = format!("/{}/_apis/wit/wiql?api-version=7.1", self.p());
        let board_path = format!(
            "/{}/{}/_apis/work/backlogs/Microsoft.FeatureCategory/workItems?api-version=7.1",
            self.p(),
            enc(&self.team)
        );
        let sprint_flow = async {
            let t_sprints = Instant::now();
            self.step_active(
                "sprints",
                format!("Reading {}\\Sprint iterations…", self.project),
            );
            let sprints = self.sprints().await?;
            let sprint_list = array(&sprints);
            let current = sprint_list
                .iter()
                .find(|s| text(&s["timeFrame"]) == "current")
                .map(|s| text(&s["name"]))
                .filter(|s| !s.is_empty())
                .unwrap_or("current + upcoming");
            self.step_done(
                "sprints",
                format!("{} sprints · {current}", sprint_list.len()),
                t_sprints,
            );

            let t_wiql = Instant::now();
            self.step_active("wiql", "Running WIQL query for Tasks, Bugs & Stories…");
            let query = overview_query(&sprints);
            let q = self
                .ado("POST", &wiql_path, Some(json!({"query":query})), false)
                .await?;
            let matched = array(&q["workItems"]).len();
            self.step_done("wiql", format!("{matched} assigned tickets matched"), t_wiql);
            Ok::<_, Error>((sprints, q))
        };
        let board_flow = async {
            let t_board = Instant::now();
            self.step_active("board", "Fetching Features board columns & state rules…");
            let (board, me, columns, states) = tokio::try_join!(
                self.get(&board_path),
                self.get("/_apis/connectionData"),
                self.feature_columns(),
                self.states()
            )?;
            let board_count = array(&board["workItems"]).len();
            let col_count = array(&columns).len();
            self.step_done(
                "board",
                format!("{board_count} board Features · {col_count} columns"),
                t_board,
            );
            Ok::<_, Error>((board, me, columns, states))
        };
        let ((sprints, q), (board, me, columns, states)) =
            tokio::try_join!(sprint_flow, board_flow)?;
        let ids: Vec<u64> = array(&q["workItems"]).iter().map(id).collect();
        let t_items = Instant::now();
        self.step_active(
            "items",
            format!("Loading {} tickets with parent & PR links…", ids.len()),
        );
        let mine = self.items_tracked(&ids, true, None, Some("items")).await?;
        self.step_done(
            "items",
            format!("{} tickets & links loaded", mine.len()),
            t_items,
        );

        let t_hierarchy = Instant::now();
        let mut all: HashMap<u64, Value> = mine.iter().map(|wi| (id(wi), wi.clone())).collect();
        let mut frontier: Vec<u64> = mine
            .iter()
            .filter_map(parent)
            .filter(|pid| !all.contains_key(pid))
            .collect();
        let mut parent_count = 0usize;
        self.step_active(
            "hierarchy",
            if frontier.is_empty() {
                "Linking tickets to Features board…".to_owned()
            } else {
                format!("Level 1 · resolving {} parent items…", frontier.len())
            },
        );
        for depth in 0..6 {
            if frontier.is_empty() {
                break;
            }
            if depth > 0 {
                self.step_active(
                    "hierarchy",
                    format!(
                        "Level {} · resolving {} parent items…",
                        depth + 1,
                        frontier.len()
                    ),
                );
            }
            let fetched = self.items(&frontier, true, None).await?;
            parent_count += fetched.len();
            all.extend(fetched.iter().map(|wi| (id(wi), wi.clone())));
            frontier = fetched
                .iter()
                .filter(|wi| wi["fields"]["System.WorkItemType"] != "Feature")
                .filter_map(parent)
                .filter(|pid| !all.contains_key(pid))
                .collect();
        }
        let board_ids: Vec<u64> = array(&board["workItems"])
            .iter()
            .filter_map(|wi| wi["target"]["id"].as_u64())
            .collect();
        let board_set: HashSet<u64> = board_ids.iter().copied().collect();
        let mut features: HashMap<u64, Value> = HashMap::new();
        let items: Vec<Value> = mine.iter().map(|wi| {
            let f = &wi["fields"];
            let mut chain = Vec::new();
            let mut feature_id = None;
            let mut on_board = false;
            let mut cur = wi;
            for _ in 0..6 {
                let Some(p) = parent(cur).and_then(|pid| all.get(&pid)) else { break; };
                cur = p;
                chain.push(json!({"id":cur["id"],"type":cur["fields"]["System.WorkItemType"],"title":cur["fields"]["System.Title"],"state":cur["fields"]["System.State"]}));
                if cur["fields"]["System.WorkItemType"] == "Feature" {
                    let fid = id(cur);
                    feature_id = Some(fid);
                    on_board = self.is_on_board(cur, &board_set);
                    features.entry(fid).or_insert_with(|| self.feature(cur, on_board, &columns));
                    break;
                }
            }
            let tags = tags(f);
            let children = children(wi);
            json!({
                "id":wi["id"],"type":f["System.WorkItemType"],"title":f["System.Title"],"state":f["System.State"],
                "iterationPath":f["System.IterationPath"],"tags":tags,
                "weeksCarried":tags.iter().filter(|t| t.len()==8 && t.bytes().all(|b| b.is_ascii_digit())).count(),
                "changedDate":f["System.ChangedDate"],"parentId":parent(wi),"chain":chain,"featureId":feature_id,
                "onBoard":on_board,"childCount":children.len(),
                "openChildCount":children.iter().filter(|cid| all.get(cid).is_some_and(|c| !matches!(text(&c["fields"]["System.State"]), "Closed"|"Removed"|"Done"))).count(),
                "childrenKnown":children.iter().all(|cid| all.contains_key(cid)),"url":self.edit_url(id(wi))
            })
        }).collect();
        let missing: Vec<u64> = board_ids
            .into_iter()
            .filter(|id| !features.contains_key(id))
            .collect();
        if !missing.is_empty() {
            self.step_active(
                "hierarchy",
                format!("Hydrating {} additional board Features…", missing.len()),
            );
        }
        for wi in self
            .items(
                &missing,
                false,
                Some(vec![
                    "System.Id",
                    "System.Title",
                    "System.State",
                    "System.IterationPath",
                    "System.AreaPath",
                    "System.AssignedTo",
                    COLUMN,
                    LANE,
                ]),
            )
            .await?
        {
            features.insert(id(&wi), self.feature(&wi, true, &columns));
        }
        let mut features: Vec<Value> = features.into_values().collect();
        features.sort_by_key(id);
        {
            let mut nodes = self.nodes.lock().unwrap();
            nodes.clear();
            for wi in all.values() {
                let wid = id(wi);
                if wid > 0 {
                    nodes.insert(wid, (self.summary(wi), parent(wi)));
                }
            }
        }
        self.step_done(
            "hierarchy",
            format!(
                "{parent_count} parents linked · {} Features ready",
                features.len()
            ),
            t_hierarchy,
        );
        Ok(json!({
            "me":{"name":me["authenticatedUser"]["providerDisplayName"],"id":me["authenticatedUser"]["id"]},
            "org":self.org,"project":self.project,"backlogPath":self.backlog(),"sprints":sprints,"features":features,
            "featureColumns":columns,"items":items,"states":states,"generatedAt":Utc::now().to_rfc3339()
        }))
    }

    async fn ancestors(&self, wi: &Value) -> Result<Vec<Value>> {
        self.remember_node(wi);
        let mut result = Vec::new();
        let mut seen = HashSet::from([id(wi)]);
        let mut pid = parent(wi);
        while let Some(p) = pid {
            if !seen.insert(p) || result.len() >= 10 {
                break;
            }
            if let Some((summary, next_parent)) = self.nodes.lock().unwrap().get(&p).cloned() {
                result.insert(0, summary);
                pid = next_parent;
                continue;
            }
            let fetched = self.items(&[p], true, None).await?;
            let Some(item) = fetched.first() else {
                break;
            };
            self.remember_node(item);
            result.insert(0, self.summary(item));
            pid = parent(item);
        }
        Ok(result)
    }
    async fn child_items(&self, wi: &Value) -> Result<Vec<Value>> {
        let mut result: Vec<Value> = self
            .items(&children(wi), false, None)
            .await?
            .iter()
            .map(|wi| self.summary(wi))
            .collect();
        result.sort_by_key(|v| (done(&v["state"]), id(v)));
        Ok(result)
    }
    fn pr(&self, pr: &Value) -> Value {
        let repo = &pr["repository"];
        let project = repo["project"]["name"].as_str().unwrap_or(&self.project);
        json!({
            "id":pr["pullRequestId"],"title":pr["title"],
            "status":if pr["isDraft"]==true && pr["status"]=="active" { json!("draft") } else { pr["status"].clone() },
            "repo":repo["name"],"author":person(&pr["createdBy"]),"created":pr["creationDate"],"closed":pr["closedDate"],
            "source":text(&pr["sourceRefName"]).trim_start_matches("refs/heads/"),
            "target":text(&pr["targetRefName"]).trim_start_matches("refs/heads/"),
            "url":format!("{}/{}/_git/{}/pullrequest/{}",self.org,enc(project),enc(text(&repo["name"])),pr["pullRequestId"])
        })
    }
    async fn pull_requests(&self, wi: &Value) -> Vec<Value> {
        let mut tasks = Vec::new();
        for relation in array(&wi["relations"])
            .iter()
            .filter(|r| r["rel"] == "ArtifactLink")
        {
            let artifact = text(&relation["url"]);
            let Some(parts) = PR_ARTIFACT.captures(artifact) else {
                continue;
            };
            let path = format!(
                "/{}/_apis/git/repositories/{}/pullrequests/{}?api-version=7.1",
                enc(&parts[1]),
                enc(&parts[2]),
                &parts[3]
            );
            let pr_id = parts[3].parse::<u64>().unwrap();
            tasks.push(async move {
                match self.get(&path).await {
                    Ok(pr) => { let mut v=self.pr(&pr); v["artifact"]=json!(artifact); v }
                    Err(error) => json!({"id":pr_id,"artifact":artifact,"error":if error.status==404 { "Not found or no access".to_owned() } else { error.error }})
                }
            });
        }
        // Each failure remains visible on its own link, without hiding the rest of the ticket.
        let mut prs = join_all(tasks).await;
        prs.sort_by_key(|v| {
            (
                match text(&v["status"]) {
                    "active" => 0,
                    "draft" => 1,
                    "completed" => 2,
                    "abandoned" => 3,
                    _ => 4,
                },
                std::cmp::Reverse(id(v)),
            )
        });
        prs
    }
    async fn detail(&self, id: u64) -> Result<Value> {
        let comments_path = format!(
            "/{}/_apis/wit/workItems/{id}/comments?$top=200&order=desc&api-version={COMMENTS_API}",
            self.p()
        );
        let (wi, comments) = tokio::try_join!(self.workitem(id), self.get(&comments_path))?;
        let (ancestors, children, prs) = tokio::join!(
            self.ancestors(&wi),
            self.child_items(&wi),
            self.pull_requests(&wi)
        );
        let (ancestors, children) = (ancestors?, children?);
        let f = &wi["fields"];
        let fields: Map<String, Value> = RICH
            .iter()
            .map(|r| (r.to_string(), f[*r].clone()))
            .collect();
        let markdown: Vec<&str> = RICH
            .iter()
            .copied()
            .filter(|r| text(&wi["multilineFieldsFormat"][*r]).eq_ignore_ascii_case("markdown"))
            .collect();
        let mapped: Vec<Value> = array(&comments["comments"]).iter().map(comment).collect();
        Ok(json!({
            "id":wi["id"],"rev":wi["rev"],"url":self.edit_url(id),
            "type":f["System.WorkItemType"],"title":f["System.Title"],"state":f["System.State"],"reason":f["System.Reason"],
            "iterationPath":f["System.IterationPath"],"areaPath":f["System.AreaPath"],"tags":tags(f),
            "assignedTo":person(&f["System.AssignedTo"]),"createdBy":person(&f["System.CreatedBy"]),"createdDate":f["System.CreatedDate"],
            "changedBy":person(&f["System.ChangedBy"]),"changedDate":f["System.ChangedDate"],"priority":f["Microsoft.VSTS.Common.Priority"],
            "parent":ancestors.last(),"ancestors":ancestors,"childCount":children.len(),"children":children,"pullRequests":prs,
            "fields":fields,"markdown":markdown,"commentCount":comments["totalCount"].as_u64().unwrap_or(mapped.len() as u64),"comments":mapped
        }))
    }

    async fn update(&self, id: u64, body: &Value) -> Result<Value> {
        let mut ops = Vec::new();
        test_revision(&mut ops, &body["rev"]);
        if let Some(title) = body["title"].as_str().filter(|s| !s.trim().is_empty()) {
            add(&mut ops, "/fields/System.Title", title.trim());
        }
        if let Some(fields) = body["fields"].as_object() {
            for (field, value) in fields {
                if !RICH.contains(&field.as_str()) {
                    return Err(Error::new(
                        400,
                        format!("Field {field} is not editable here"),
                    ));
                }
                if !value.is_null() && !value.is_string() {
                    return Err(Error::new(400, "Rich-text fields must be strings"));
                }
                add(&mut ops, format!("/fields/{field}"), text(value));
                if array(&body["markdown"]).iter().any(|v| v == field) {
                    add(
                        &mut ops,
                        format!("/multilineFieldsFormat/{field}"),
                        "Markdown",
                    );
                }
            }
        }
        if let Some(iteration) = body["iterationPath"].as_str().filter(|s| !s.is_empty()) {
            if iteration.starts_with(&format!("{}\\", self.backlog())) {
                let wi = self
                    .get(&format!(
                        "/_apis/wit/workitems/{id}?fields=System.WorkItemType&api-version=7.1"
                    ))
                    .await?;
                if !matches!(text(&wi["fields"]["System.WorkItemType"]), "Task" | "Bug") {
                    return Err(Error::new(
                        400,
                        format!(
                            "Stories and Features stay in {}; only Tasks and Bugs go into sprints.",
                            self.backlog()
                        ),
                    ));
                }
            }
            add(&mut ops, "/fields/System.IterationPath", iteration);
        }
        if let Some(state) = body["state"].as_str().filter(|s| !s.is_empty()) {
            add(&mut ops, "/fields/System.State", state);
        }
        if let Some(tag_list) = body["tags"].as_array() {
            let mut seen = HashSet::new();
            let mut cleaned = Vec::new();
            for raw in tag_list {
                for part in text(raw).split(';') {
                    let t = part.trim();
                    if !t.is_empty() && seen.insert(t.to_lowercase()) {
                        cleaned.push(t.to_owned());
                    }
                }
            }
            ops.push(json!({
                "op": "replace",
                "path": "/fields/System.Tags",
                "value": cleaned.join("; ")
            }));
        }
        if body["unassign"] == true {
            add(&mut ops, "/fields/System.AssignedTo", "");
        }
        if body.get("parentId").is_some() {
            let wi = self.workitem(id).await?;
            if let Some(index) = array(&wi["relations"])
                .iter()
                .position(|r| r["rel"] == "System.LinkTypes.Hierarchy-Reverse")
            {
                ops.push(json!({"op":"remove","path":format!("/relations/{index}")}));
            }
            if !body["parentId"].is_null() {
                let parent_id = body["parentId"]
                    .as_u64()
                    .filter(|id| *id > 0)
                    .ok_or_else(|| Error::new(400, "Invalid parent ID"))?;
                add(
                    &mut ops,
                    "/relations/-",
                    json!({"rel":"System.LinkTypes.Hierarchy-Reverse","url":format!("{}/_apis/wit/workItems/{parent_id}",self.org)}),
                );
            }
        }
        if ops.is_empty() {
            return Ok(json!({"ok":true,"unchanged":true}));
        }
        let wi = self.patch(id, ops).await.map_err(|e| {
            if !body["rev"].is_null()
                && (e.status == 412
                    || ["rev", "TF26071", "test operation"]
                        .iter()
                        .any(|s| e.error.contains(s)))
            {
                Error::new(
                    409,
                    "Someone changed this item since you opened it. Reload it and try again.",
                )
            } else {
                e
            }
        })?;
        if body.get("parentId").is_some() {
            self.nodes.lock().unwrap().clear();
        } else {
            self.nodes.lock().unwrap().remove(&id);
        }
        Ok(
            json!({"id":wi["id"],"rev":wi["rev"],"title":wi["fields"]["System.Title"],"state":wi["fields"]["System.State"],"iterationPath":wi["fields"]["System.IterationPath"],"tags":tags(&wi["fields"])}),
        )
    }

    async fn link_pr(&self, id: u64, body: &Value) -> Result<Value> {
        let (project, pr_id) = parse_pr_ref(required(body, "ref")?, &self.project)?;
        let pr = self
            .get(&format!(
                "/{}/_apis/git/pullrequests/{pr_id}?api-version=7.1",
                enc(&project)
            ))
            .await?;
        let repo = &pr["repository"];
        let project_id = required(&repo["project"], "id")?;
        let repo_id = required(repo, "id")?;
        let artifact = format!("vstfs:///Git/PullRequestId/{project_id}%2F{repo_id}%2F{pr_id}");
        let wi = self.workitem(id).await?;
        if array(&wi["relations"])
            .iter()
            .any(|r| r["rel"] == "ArtifactLink" && text(&r["url"]).eq_ignore_ascii_case(&artifact))
        {
            return Err(Error::new(409, format!("PR {pr_id} is already linked")));
        }
        let mut ops = Vec::new();
        test_revision(&mut ops, &wi["rev"]);
        add(
            &mut ops,
            "/relations/-",
            json!({"rel":"ArtifactLink","url":artifact,"attributes":{"name":"Pull Request"}}),
        );
        let updated = self.patch(id, ops).await?;
        let mut mapped = self.pr(&pr);
        mapped["artifact"] = json!(artifact);
        Ok(json!({"rev":updated["rev"],"pullRequest":mapped}))
    }
    async fn unlink_pr(&self, id: u64, body: &Value) -> Result<Value> {
        let artifact = required(body, "artifact")?;
        let wi = self.workitem(id).await?;
        let Some(index) = array(&wi["relations"]).iter().position(|r| {
            r["rel"] == "ArtifactLink" && text(&r["url"]).eq_ignore_ascii_case(artifact)
        }) else {
            return Ok(json!({"rev":wi["rev"],"unchanged":true}));
        };
        let mut ops = Vec::new();
        test_revision(&mut ops, &wi["rev"]);
        ops.push(json!({"op":"remove","path":format!("/relations/{index}")}));
        let updated = self.patch(id, ops).await?;
        Ok(json!({"rev":updated["rev"]}))
    }

    pub async fn attachment(&self, input: &str) -> Result<Value> {
        let url = Url::parse(input).map_err(|_| Error::new(400, "Invalid attachment URL"))?;
        let org = Url::parse(&self.org).map_err(|_| Error::new(400, "Invalid organization URL"))?;
        if url.origin() != org.origin()
            || !url
                .path()
                .to_lowercase()
                .contains("/_apis/wit/attachments/")
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return Err(Error::new(
                400,
                "Only attachments from your Azure DevOps organization can be loaded",
            ));
        }
        let response = self
            .client
            .get(url)
            .bearer_auth(self.auth.token().await?)
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(Error::new(
                response.status().as_u16(),
                "Could not load the Azure DevOps attachment",
            ));
        }
        let mime = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_owned();
        if !matches!(
            mime.split(';').next().unwrap_or("").trim(),
            "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/bmp" | "image/avif"
        ) {
            return Err(Error::new(415, "Unsupported attachment image type"));
        }
        let mut response = response;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 20 * 1024 * 1024 {
                return Err(Error::new(413, "Attachment is larger than 20 MB"));
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(json!({"mime":mime,"data":STANDARD.encode(bytes)}))
    }

    pub async fn request(self: Arc<Self>, method: &str, url: &str, body: Value) -> Result<Value> {
        let parts: Vec<&str> = url.trim_start_matches('/').split('/').collect();
        match (method, parts.as_slice()) {
            ("GET", ["progress"]) => Ok(self.progress_snapshot()),
            ("GET", ["auth", "status"]) => {
                self.begin_progress(false);
                let t0 = Instant::now();
                self.step_active(
                    "auth",
                    format!("Acquiring Azure CLI token for {}…", self.project),
                );
                let token_res = self.auth.token().await;
                if token_res.is_ok() {
                    self.step_active("auth", format!("Verifying {} session…", self.project));
                }
                let result = match token_res {
                    Ok(_) => self.get("/_apis/connectionData").await,
                    Err(e) => Err(e),
                };
                let method = self.auth.method().await;
                Ok(match result {
                    Ok(me) => {
                        let user = text(&me["authenticatedUser"]["providerDisplayName"]);
                        self.step_done(
                            "auth",
                            format!(
                                "{} · {}",
                                if user.is_empty() { "Signed in" } else { user },
                                if method == "device-code" {
                                    "device code"
                                } else {
                                    "Azure CLI"
                                }
                            ),
                            t0,
                        );
                        json!({"signedIn":true,"method":method,"user":me["authenticatedUser"]["providerDisplayName"],"org":self.org})
                    }
                    Err(error) => {
                        self.finish_progress();
                        json!({"signedIn":false,"method":method,"error":error.error,"org":self.org})
                    }
                })
            }
            ("POST", ["auth", "cli"]) => self.auth.sign_in_cli().await,
            ("POST", ["auth", "device"]) => self.auth.start_device().await,
            ("GET", ["auth", "device"]) => Ok(self.auth.poll_device().await),
            ("GET", ["overview"]) => self.overview().await,
            ("GET", ["sprints"]) => self.sprints().await,
            ("PATCH", ["features", work_id, "column"]) => {
                let id = positive_id(work_id)?;
                let name = required(&body, "column")?;
                let columns = self.feature_columns().await?;
                let col = array(&columns)
                    .iter()
                    .find(|c| c["name"] == name)
                    .ok_or_else(|| Error::new(400, format!("Unknown board column \"{name}\"")))?;
                let mut ops = Vec::new();
                add(&mut ops, "/fields/System.State", col["state"].clone());
                if col["type"] == "inProgress" {
                    add(&mut ops, format!("/fields/{COLUMN}"), col["name"].clone());
                }
                let wi = self.patch(id, ops).await?;
                Ok(
                    json!({"id":wi["id"],"state":wi["fields"]["System.State"],"column":wi["fields"][COLUMN].as_str().unwrap_or(name)}),
                )
            }
            ("GET", ["workitems", work_id]) => self.detail(positive_id(work_id)?).await,
            ("PATCH", ["workitems", work_id]) => self.update(positive_id(work_id)?, &body).await,
            ("GET", ["workitems", work_id, "ancestors"]) => {
                let wi = self.workitem(positive_id(work_id)?).await?;
                Ok(json!({"ancestors":self.ancestors(&wi).await?}))
            }
            ("GET", ["workitems", work_id, "children"]) => {
                let wi = self.workitem(positive_id(work_id)?).await?;
                Ok(json!({"children":self.child_items(&wi).await?}))
            }
            ("POST", ["workitems", work_id, "pull-requests"]) => {
                self.link_pr(positive_id(work_id)?, &body).await
            }
            ("DELETE", ["workitems", work_id, "pull-requests"]) => {
                self.unlink_pr(positive_id(work_id)?, &body).await
            }
            ("POST", ["workitems", work_id, "comments"]) => {
                let text = required(&body, "text")?;
                let id = positive_id(work_id)?;
                let value = self
                    .ado(
                        "POST",
                        &format!(
                            "/{}/_apis/wit/workItems/{id}/comments?api-version={COMMENTS_API}",
                            self.p()
                        ),
                        Some(json!({"text":text})),
                        false,
                    )
                    .await?;
                Ok(comment(&value))
            }
            ("PATCH", ["workitems", work_id, "comments", comment_id]) => {
                let text = required(&body, "text")?;
                let id = positive_id(work_id)?;
                let cid = positive_id(comment_id)?;
                let fmt = if body["format"] == "markdown" {
                    "&format=markdown"
                } else {
                    ""
                };
                let value=self.ado("PATCH",&format!("/{}/_apis/wit/workItems/{id}/comments/{cid}?api-version={COMMENTS_API}{fmt}",self.p()),Some(json!({"text":text})),false).await?;
                Ok(comment(&value))
            }
            _ => Err(Error::new(
                404,
                format!("Unknown planner operation: {method} {url}"),
            )),
        }
    }
}

fn time_frame(start: &Value, finish: &Value) -> &'static str {
    let Some((start, finish)) = start.as_str().zip(finish.as_str()) else {
        return "unscheduled";
    };
    let (Ok(start), Ok(finish)) = (
        DateTime::parse_from_rfc3339(start),
        DateTime::parse_from_rfc3339(finish),
    ) else {
        return "unscheduled";
    };
    let now = Utc::now();
    if now < start {
        "future"
    } else if now >= finish + Duration::days(1) {
        "past"
    } else {
        "current"
    }
}
fn overview_query(sprints: &Value) -> String {
    let live: Vec<String> = array(sprints)
        .iter()
        .filter(|s| matches!(text(&s["timeFrame"]), "current" | "future"))
        .map(|s| format!("'{}'", text(&s["path"]).replace('\'', "''")))
        .collect();
    let keep = if live.is_empty() {
        String::new()
    } else {
        format!(
            " OR ([System.State] <> 'Removed' AND [System.IterationPath] IN ({}))",
            live.join(",")
        )
    };
    format!("SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @Me AND [System.WorkItemType] IN ({}) AND ([System.State] NOT IN ('Closed','Removed','Done') OR ([System.State] = 'Closed' AND [System.ChangedDate] >= @Today - 21){keep})",
        TYPES.iter().map(|t| format!("'{t}'")).collect::<Vec<_>>().join(","))
}
fn parse_pr_ref(input: &str, project: &str) -> Result<(String, u64)> {
    let bare = input.strip_prefix('!').unwrap_or(input);
    if let Ok(id) = positive_id(bare) {
        return Ok((project.to_owned(), id));
    }
    if let Ok(url) = Url::parse(input) {
        if matches!(url.scheme(), "https" | "http") {
            let segments: Vec<_> = url.path_segments().into_iter().flatten().collect();
            if let Some(index) = segments.iter().position(|s| s.eq_ignore_ascii_case("_git")) {
                if index > 0
                    && segments
                        .get(index + 2)
                        .is_some_and(|s| s.eq_ignore_ascii_case("pullrequest"))
                {
                    let project = url::form_urlencoded::parse(
                        format!("p={}", segments[index - 1]).as_bytes(),
                    )
                    .next()
                    .map(|(_, v)| v.into_owned())
                    .ok_or_else(|| Error::new(400, "Invalid PR project"))?;
                    if let Some(id) = segments.get(index + 3) {
                        return Ok((project, positive_id(id)?));
                    }
                }
            }
        }
    }
    Err(Error::new(
        400,
        "Paste a pull request URL (.../_git/repo/pullrequest/123) or a PR number",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        matchers::{body_json, method, path},
        Mock, MockServer, ResponseTemplate,
    };

    fn mocked(server: &MockServer) -> Arc<Backend> {
        let client = reqwest::Client::new();
        Arc::new(Backend {
            auth: Arc::new(Auth::for_test(client.clone())),
            client,
            org: server.uri(),
            project: "Test Project".into(),
            team: "test-team".into(),
            sprint_root: "Sprint".into(),
            progress: Mutex::new(Progress::new("Test Project")),
            nodes: Mutex::new(HashMap::new()),
        })
    }
    async fn respond(server: &MockServer, verb: &str, route: &str, value: Value) {
        Mock::given(method(verb))
            .and(path(route))
            .respond_with(ResponseTemplate::new(200).set_body_json(value))
            .expect(1)
            .mount(server)
            .await;
    }

    #[tokio::test]
    async fn detail_keeps_fields_comments_hierarchy_and_prs() {
        let server = MockServer::start().await;
        let backend = mocked(&server);
        respond(&server,"GET","/_apis/wit/workitems/10",json!({
            "id":10,"rev":3,"fields":{"System.WorkItemType":"Task","System.Title":"Synthetic task","System.State":"Active",
                "System.Tags":"Backend; 20260101","System.Description":"# Description"},
            "multilineFieldsFormat":{"System.Description":"Markdown"},
            "relations":[
                {"rel":"System.LinkTypes.Hierarchy-Reverse","url":format!("{}/2",server.uri())},
                {"rel":"System.LinkTypes.Hierarchy-Forward","url":format!("{}/20",server.uri())},
                {"rel":"ArtifactLink","url":"vstfs:///Git/PullRequestId/project%2Frepo%2F7"}
            ]
        })).await;
        respond(
            &server,
            "GET",
            "/Test%20Project/_apis/wit/workItems/10/comments",
            json!({
                "totalCount":1,"comments":[{"id":1,"text":"Synthetic comment","format":"Markdown"}]
            }),
        )
        .await;
        Mock::given(method("POST")).and(path("/Test%20Project/_apis/wit/workitemsbatch"))
            .and(body_json(json!({"ids":[2],"errorPolicy":"omit","$expand":"relations"})))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"value":[{"id":2,"fields":{
                "System.Title":"Synthetic feature","System.WorkItemType":"Feature","System.State":"Active"}}]})))
            .expect(1).mount(&server).await;
        Mock::given(method("POST")).and(path("/Test%20Project/_apis/wit/workitemsbatch"))
            .and(body_json(json!({"ids":[20],"errorPolicy":"omit"})))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"value":[{"id":20,"fields":{
                "System.Title":"Synthetic child","System.WorkItemType":"Task","System.State":"Closed"}}]})))
            .expect(1).mount(&server).await;
        respond(
            &server,
            "GET",
            "/project/_apis/git/repositories/repo/pullrequests/7",
            json!({
                "pullRequestId":7,"title":"Synthetic PR","status":"active","isDraft":true,
                "repository":{"name":"repo","project":{"name":"Test Project"}},
                "sourceRefName":"refs/heads/topic","targetRefName":"refs/heads/main"
            }),
        )
        .await;
        let detail = backend
            .request("GET", "/workitems/10", Value::Null)
            .await
            .unwrap();
        assert_eq!(detail["parent"]["id"], 2);
        assert_eq!(detail["children"][0]["id"], 20);
        assert_eq!(detail["markdown"], json!(["System.Description"]));
        assert_eq!(detail["commentCount"], 1);
        assert_eq!(detail["pullRequests"][0]["status"], "draft");
        assert_eq!(detail["pullRequests"][0]["source"], "topic");
        assert!(text(&detail["pullRequests"][0]["url"])
            .ends_with("/Test%20Project/_git/repo/pullrequest/7"));
    }
    #[tokio::test]
    async fn editing_uses_revision_and_preserves_markdown() {
        let server = MockServer::start().await;
        Mock::given(method("PATCH"))
            .and(path("/_apis/wit/workitems/10"))
            .and(body_json(json!([
                {"op":"test","path":"/rev","value":3},
                {"op":"add","path":"/fields/System.Description","value":"# Updated"},
                {"op":"add","path":"/multilineFieldsFormat/System.Description","value":"Markdown"},
                {"op":"replace","path":"/fields/System.Tags","value":"FY26 C5; Backend; Sprint-Unplanned"}
            ])))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(json!({"id":10,"rev":4,"fields":{"System.Tags":"FY26 C5; Backend; Sprint-Unplanned"}})),
            )
            .expect(1)
            .mount(&server)
            .await;
        let result=mocked(&server).request("PATCH","/workitems/10",json!({
            "rev":3,"fields":{"System.Description":"# Updated"},"markdown":["System.Description"],
            "tags":["FY26 C5","Backend","Sprint-Unplanned"]
        })).await        .unwrap();
        assert_eq!(result["rev"], 4);
        assert_eq!(result["tags"], json!(["FY26 C5", "Backend", "Sprint-Unplanned"]));
        let requests = server.received_requests().await.unwrap();
        let content_types: Vec<_> = requests[0].headers.get_all("content-type").iter().collect();
        assert_eq!(
            content_types.len(),
            1,
            "PATCH must send exactly one Content-Type header"
        );
        assert_eq!(content_types[0], "application/json-patch+json");
    }
    #[tokio::test]
    async fn revision_conflicts_and_non_sprintable_items_are_rejected() {
        let server = MockServer::start().await;
        Mock::given(method("PATCH"))
            .and(path("/_apis/wit/workitems/10"))
            .respond_with(
                ResponseTemplate::new(412).set_body_json(json!({"message":"Revision conflict"})),
            )
            .expect(1)
            .mount(&server)
            .await;
        let backend = mocked(&server);
        let error = backend
            .clone()
            .request("PATCH", "/workitems/10", json!({"rev":3,"title":"Updated"}))
            .await
            .unwrap_err();
        assert_eq!(error.status, 409);
        respond(
            &server,
            "GET",
            "/_apis/wit/workitems/11",
            json!({"id":11,"fields":{"System.WorkItemType":"User Story"}}),
        )
        .await;
        let error = backend
            .request(
                "PATCH",
                "/workitems/11",
                json!({"iterationPath":"Test Project\\Sprint\\future"}),
            )
            .await
            .unwrap_err();
        assert_eq!(error.status, 400);
        assert!(error.error.contains("only Tasks and Bugs"));
    }
    #[tokio::test]
    async fn moving_between_sprints_sends_one_patch_content_type() {
        let server = MockServer::start().await;
        respond(
            &server,
            "GET",
            "/_apis/wit/workitems/10",
            json!({
                "id":10,"fields":{"System.WorkItemType":"Task"}
            }),
        )
        .await;
        Mock::given(method("PATCH"))
            .and(path("/_apis/wit/workitems/10"))
            .and(body_json(json!([{
                "op":"add","path":"/fields/System.IterationPath",
                "value":"Test Project\\Sprint\\next"
            }])))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "id":10,"rev":4,"fields":{
                    "System.Title":"Synthetic task","System.State":"Active",
                    "System.IterationPath":"Test Project\\Sprint\\next"
                }
            })))
            .expect(1)
            .mount(&server)
            .await;
        let result = mocked(&server)
            .request(
                "PATCH",
                "/workitems/10",
                json!({
                    "iterationPath":"Test Project\\Sprint\\next"
                }),
            )
            .await
            .unwrap();
        assert_eq!(result["iterationPath"], "Test Project\\Sprint\\next");
        let requests = server.received_requests().await.unwrap();
        let patch = requests
            .iter()
            .find(|request| request.method.as_str() == "PATCH")
            .unwrap();
        let content_types: Vec<_> = patch.headers.get_all("content-type").iter().collect();
        assert_eq!(content_types.len(), 1);
        assert_eq!(content_types[0], "application/json-patch+json");
    }
    #[tokio::test]
    async fn attachment_origin_is_checked_and_unknown_routes_fail() {
        let server = MockServer::start().await;
        let backend = mocked(&server);
        assert_eq!(
            backend
                .attachment("https://other.example/_apis/wit/attachments/id")
                .await
                .unwrap_err()
                .status,
            400
        );
        assert_eq!(
            backend
                .attachment(&format!("{}/other", server.uri()))
                .await
                .unwrap_err()
                .status,
            400
        );
        assert_eq!(
            backend
                .request("GET", "/unsupported", Value::Null)
                .await
                .unwrap_err()
                .status,
            404
        );
        assert!(server.received_requests().await.unwrap().is_empty());
    }
    #[test]
    fn current_and_future_closed_items_never_age_out() {
        let query = overview_query(&json!([
            {"timeFrame":"current","path":"SAN SA\\Sprint\\2026.01"},
            {"timeFrame":"future","path":"SAN SA\\Sprint\\O'Brien"},
            {"timeFrame":"past","path":"SAN SA\\Sprint\\old"},
            {"timeFrame":"unscheduled","path":"SAN SA\\Sprint\\undated"}
        ]));
        assert!(query.contains("'SAN SA\\Sprint\\2026.01'"));
        assert!(query.contains("O''Brien"));
        assert!(!query.contains("\\old"));
        assert!(!query.contains("\\undated"));
        assert!(query.contains("[System.State] <> 'Removed'"));
        assert!(!overview_query(&json!([])).contains("IN ()"));
    }
    #[test]
    fn parses_pr_numbers_and_encoded_urls() {
        assert_eq!(
            parse_pr_ref("!123", "SAN SA").unwrap(),
            ("SAN SA".into(), 123)
        );
        assert_eq!(
            parse_pr_ref(
                "https://dev.azure.com/org/SAN%20SA/_git/repo/pullrequest/123",
                "other"
            )
            .unwrap(),
            ("SAN SA".into(), 123)
        );
        assert!(parse_pr_ref("javascript:alert(1)", "SAN SA").is_err());
        assert!(parse_pr_ref("0", "SAN SA").is_err());
    }
    #[test]
    fn hierarchy_and_comment_shapes_match_the_browser_api() {
        let wi = json!({"id":10,"relations":[
            {"rel":"System.LinkTypes.Hierarchy-Reverse","url":"https://example/1"},
            {"rel":"System.LinkTypes.Hierarchy-Forward","url":"https://example/20"}
        ]});
        assert_eq!(parent(&wi), Some(1));
        assert_eq!(children(&wi), vec![20]);
        let c = comment(
            &json!({"id":1,"text":"hello","format":"Markdown","createdBy":{"id":"a","displayName":"Person","uniqueName":"p@example.com"}}),
        );
        assert_eq!(c["format"], "markdown");
        assert_eq!(c["createdBy"]["name"], "Person");
        assert_eq!(c["createdBy"]["email"], "p@example.com");
    }
    #[test]
    fn invalid_input_is_an_explicit_error() {
        assert!(positive_id("../1").is_err());
        assert!(required(&json!({"text":"  "}), "text").is_err());
        assert_eq!(enc("SAN SA"), "SAN%20SA");
    }
    #[tokio::test]
    async fn closed_features_in_san_sa_sprint_stay_on_board() {
        let server = MockServer::start().await;
        let backend = mocked(&server);
        let board_set = HashSet::new();
        let columns = json!([
            {"name":"New","state":"New","type":"incoming"},
            {"name":"In Development","state":"Work in Progress","type":"inProgress"},
            {"name":"Shipped/Closed","state":"Closed","type":"outgoing"}
        ]);
        let shipped = json!({
            "id": 500,
            "fields": {
                "System.Title": "Shipped feature",
                "System.State": "Closed",
                "System.AreaPath": "Test Project\\Scaffolding",
                "System.IterationPath": "Test Project\\Sprint"
            }
        });
        assert!(backend.is_on_board(&shipped, &board_set));
        let summarized = backend.feature(&shipped, true, &columns);
        assert_eq!(summarized["onBoard"], true);
        assert_eq!(summarized["column"], "Shipped/Closed");

        let legacy = json!({
            "id": 501,
            "fields": {
                "System.Title": "Legacy feature",
                "System.State": "Active",
                "System.AreaPath": "Test Project\\Scaffolding",
                "System.IterationPath": "Test Project\\Month\\2026.02"
            }
        });
        assert!(!backend.is_on_board(&legacy, &board_set));
    }
    #[tokio::test]
    async fn progress_endpoint_tracks_startup_steps() {
        let server = MockServer::start().await;
        respond(
            &server,
            "GET",
            "/_apis/connectionData",
            json!({"authenticatedUser":{"id":"u1","providerDisplayName":"Raul"}}),
        )
        .await;
        let backend = mocked(&server);
        let initial = backend
            .clone()
            .request("GET", "/progress", Value::Null)
            .await
            .unwrap();
        assert_eq!(initial["active"], true);
        assert_eq!(initial["steps"].as_array().unwrap().len(), 6);
        assert_eq!(initial["steps"][0]["id"], "auth");
        assert_eq!(initial["steps"][0]["state"], "active");

        let status = backend
            .clone()
            .request("GET", "/auth/status", Value::Null)
            .await
            .unwrap();
        assert_eq!(status["signedIn"], true);

        let after_auth = backend
            .request("GET", "/progress", Value::Null)
            .await
            .unwrap();
        assert_eq!(after_auth["steps"][0]["state"], "done");
        assert_eq!(after_auth["steps"][0]["detail"], "Raul · Azure CLI");
        assert!(after_auth["steps"][0]["ms"].is_number());
    }
}
