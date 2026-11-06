use crate::{
    application::progress::Progress,
    domain::{
        error::{enc, positive_id, required, Error, Result},
        feature::{is_on_board, map_feature, map_feature_columns, COLUMN, FEATURE_BATCH_FIELDS},
        pull_request::{
            map_github_pr, map_pr, parse_github_pr_url, parse_pr_ref, sort_pull_requests, PrRef,
            PR_ARTIFACT,
        },
        sprint::map_sprints,
        work_item::{
            add, array, children, comment, done, id, is_closed_or_removed, is_sprintable,
            normalize_tags, overview_query, parent, person, standup_query, summary, tags,
            test_revision, text, validate_priority, weeks_carried, COMMENTS_API, RICH,
            STANDUP_USERS,
        },
    },
    infrastructure::ado::AdoClient,
};
use chrono::Utc;
use serde_json::{json, Map, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::Instant,
};

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

pub struct PlannerService {
    ado: AdoClient,
    progress: Mutex<Progress>,
    nodes: Mutex<HashMap<u64, (Value, Option<u64>)>>,
    me_email: Mutex<String>,
    board_state: Mutex<Value>,
    team_pool: Mutex<Option<(Instant, Vec<Value>)>>,
}

const SEARCH_FIELDS: [&str; 10] = [
    "System.Id",
    "System.WorkItemType",
    "System.Title",
    "System.State",
    "Microsoft.VSTS.Common.Priority",
    "System.IterationPath",
    "System.AssignedTo",
    "System.ChangedDate",
    "System.CreatedDate",
    "System.Tags",
];

fn is_standup_member(assigned_to: &Value) -> bool {
    let email = {
        let e = text(&assigned_to["email"]);
        if e.is_empty() {
            text(&assigned_to["uniqueName"])
        } else {
            e
        }
    }
    .to_ascii_lowercase();
    if !email.is_empty() && STANDUP_USERS.iter().any(|u| u.eq_ignore_ascii_case(&email)) {
        return true;
    }
    let name = {
        let n = text(&assigned_to["name"]);
        if n.is_empty() {
            text(&assigned_to["displayName"])
        } else {
            n
        }
    }
    .to_ascii_lowercase();
    const NAMES: [&str; 12] = [
        "paula boyano",
        "raul portugues",
        "soran alatas",
        "soran zana alatas",
        "angelo marchesin",
        "gemma fornons",
        "nicolas lattuada",
        "george marques",
        "marina sauca",
        "tianpei li",
        "claire wang",
        "jiarui gui",
    ];
    !name.is_empty() && NAMES.iter().any(|n| name.contains(n))
}

fn recency_ts(item: &Value) -> &str {
    let changed = text(&item["changedDate"]);
    let created = text(&item["createdDate"]);
    if changed >= created {
        changed
    } else {
        created
    }
}

fn matches_search_words(item: &Value, words: &[String], parsed_id: Option<u64>) -> bool {
    let wid = id(item);
    if let Some(pid) = parsed_id {
        if wid == pid || wid.to_string().starts_with(&pid.to_string()) {
            return true;
        }
    }
    if words.is_empty() {
        return true;
    }
    let tags_str = array(&item["tags"])
        .iter()
        .map(text)
        .collect::<Vec<_>>()
        .join(" ");
    let hay = format!(
        "{} {} {} {} {}",
        wid,
        text(&item["title"]),
        tags_str,
        text(&item["assignedTo"]["name"]),
        text(&item["assignedTo"]["email"])
    )
    .to_lowercase();
    words.iter().all(|w| hay.contains(w))
}

fn parse_search_ticket_id(q: &str) -> Option<u64> {
    let s = q.trim();
    if let Some(pos) = s.to_ascii_lowercase().find("_workitems/edit/") {
        let rest = &s[pos + "_workitems/edit/".len()..];
        let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = digits.parse::<u64>() {
            if n >= 100 {
                return Some(n);
            }
        }
    }
    let stripped = s
        .strip_prefix("AB#")
        .or_else(|| s.strip_prefix("ab#"))
        .or_else(|| s.strip_prefix("Ab#"))
        .or_else(|| s.strip_prefix('#'))
        .unwrap_or(s);
    stripped.parse::<u64>().ok().filter(|n| *n >= 100)
}

impl PlannerService {
    pub fn new() -> Result<Self> {
        let ado = AdoClient::new()?;
        let progress = Progress::new(ado.project());
        Ok(Self {
            ado,
            progress: Mutex::new(progress),
            nodes: Mutex::new(HashMap::new()),
            me_email: Mutex::new(String::new()),
            board_state: Mutex::new(json!({})),
            team_pool: Mutex::new(None),
        })
    }

    #[cfg(test)]
    pub fn for_test(uri: String) -> Arc<Self> {
        let ado = AdoClient::for_test(uri);
        let progress = Progress::new(ado.project());
        Arc::new(Self {
            ado,
            progress: Mutex::new(progress),
            nodes: Mutex::new(HashMap::new()),
            me_email: Mutex::new(String::new()),
            board_state: Mutex::new(json!({})),
            team_pool: Mutex::new(None),
        })
    }

    fn summary(&self, wi: &Value) -> Value {
        summary(wi, &self.ado.edit_url(id(wi)))
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
        self.progress
            .lock()
            .unwrap()
            .reset(self.ado.project(), preserve_auth);
    }

    fn step_active(&self, step_id: &'static str, detail: impl Into<String>) {
        self.progress.lock().unwrap().step_active(step_id, detail);
    }

    fn step_done(&self, step_id: &'static str, detail: impl Into<String>, started: Instant) {
        self.progress
            .lock()
            .unwrap()
            .step_done(step_id, detail, started);
    }

    fn finish_progress(&self) {
        self.progress.lock().unwrap().finish();
    }

    fn progress_snapshot(&self) -> Value {
        self.progress.lock().unwrap().snapshot()
    }

    async fn items(
        &self,
        ids: &[u64],
        relations: bool,
        fields: Option<&[&str]>,
    ) -> Result<Vec<Value>> {
        self.items_tracked(ids, relations, fields, None).await
    }

    async fn items_tracked(
        &self,
        ids: &[u64],
        relations: bool,
        fields: Option<&[&str]>,
        progress_step: Option<&'static str>,
    ) -> Result<Vec<Value>> {
        self.ado
            .items_batch(ids, relations, fields, |idx, chunk_count, loaded, total| {
                if let Some(step_id) = progress_step {
                    if chunk_count > 1 {
                        self.step_active(
                            step_id,
                            format!(
                                "Batch {idx}/{chunk_count} · loading {loaded} of {total} tickets…"
                            ),
                        );
                    }
                }
            })
            .await
    }

    async fn sprints(&self) -> Result<Value> {
        let node_path = format!(
            "/{}/_apis/wit/classificationnodes/Iterations/{}?$depth=1&api-version=7.1",
            self.ado.project_encoded(),
            enc(self.ado.sprint_root())
        );
        let team_path = format!(
            "/{}/{}/_apis/work/teamsettings/iterations?api-version=7.1",
            self.ado.project_encoded(),
            enc(self.ado.team())
        );
        let (node, team) = tokio::try_join!(self.ado.get(&node_path), self.ado.get(&team_path))?;
        Ok(map_sprints(&node, &team, &self.ado.backlog_path()))
    }

    async fn feature_columns(&self) -> Result<Value> {
        let columns = self
            .ado
            .get(&format!(
                "/{}/{}/_apis/work/boards/Features/columns?api-version=7.1",
                self.ado.project_encoded(),
                enc(self.ado.team())
            ))
            .await?;
        Ok(map_feature_columns(&columns))
    }

    fn is_on_board(&self, wi: &Value, board_set: &HashSet<u64>) -> bool {
        is_on_board(
            wi,
            board_set,
            self.ado.project(),
            &self.ado.backlog_path(),
        )
    }

    fn feature(&self, wi: &Value, on_board: bool, columns: &Value) -> Value {
        map_feature(wi, on_board, columns, &self.ado.edit_url(id(wi)))
    }

    async fn states(&self) -> Result<Value> {
        let fetch = |t: &'static str| async move {
            let v = self
                .ado
                .get(&format!(
                    "/{}/_apis/wit/workitemtypes/{}/states?api-version=7.1",
                    self.ado.project_encoded(),
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

    fn email_to_doc_id(email: &str) -> String {
        email
            .split('@')
            .next()
            .unwrap_or(email)
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect()
    }

    async fn resolve_me_identity(&self, me_hint: Option<&Value>) -> (String, String) {
        if let Some(me) = me_hint {
            let acc = text(&me["authenticatedUser"]["properties"]["Account"]["$value"]);
            let email = if !acc.is_empty() {
                acc.to_owned()
            } else {
                text(&me["authenticatedUser"]["uniqueName"]).to_owned()
            };
            if !email.is_empty() {
                *self.me_email.lock().unwrap() = email.clone();
                return (email.clone(), Self::email_to_doc_id(&email));
            }
        }
        let cached = self.me_email.lock().unwrap().clone();
        if !cached.is_empty() {
            return (cached.clone(), Self::email_to_doc_id(&cached));
        }
        if let Ok(me) = self.ado.get("/_apis/connectionData").await {
            let acc = text(&me["authenticatedUser"]["properties"]["Account"]["$value"]);
            let email = if !acc.is_empty() {
                acc.to_owned()
            } else {
                text(&me["authenticatedUser"]["uniqueName"]).to_owned()
            };
            if !email.is_empty() {
                *self.me_email.lock().unwrap() = email.clone();
                return (email.clone(), Self::email_to_doc_id(&email));
            }
        }
        ("me".to_owned(), "me".to_owned())
    }

    async fn settings(&self, me_hint: Option<&Value>) -> Value {
        let (email, doc_id) = self.resolve_me_identity(me_hint).await;
        let doc_url = format!(
            "{}/{doc_id}?api-version=3.1-preview.1",
            self.ado.extmgmt_boards_url()
        );
        if let Ok(doc) = self.ado.get(&doc_url).await {
            let state = json!({
                "layout": doc.get("layout").cloned().unwrap_or(Value::Null),
                "notes": doc.get("notes").cloned().unwrap_or(Value::Null),
                "prefs": doc.get("prefs").cloned().unwrap_or(Value::Null),
            });
            *self.board_state.lock().unwrap() = state.clone();
            return state;
        }
        // One-time transparent migration from legacy /me/TicketsPlanner if present
        if let Ok(legacy) = self
            .ado
            .get("/_apis/Settings/Entries/me/TicketsPlanner?api-version=7.1-preview.1")
            .await
        {
            if legacy["value"].is_object() && !legacy["value"].as_object().unwrap().is_empty() {
                let migrated = legacy["value"].clone();
                *self.board_state.lock().unwrap() = migrated.clone();
                let put_url = format!("{}?api-version=3.1-preview.1", self.ado.extmgmt_boards_url());
                let doc = json!({
                    "id": doc_id,
                    "__etag": -1,
                    "email": email.to_lowercase(),
                    "layout": migrated.get("layout").cloned().unwrap_or(Value::Null),
                    "notes": migrated.get("notes").cloned().unwrap_or(Value::Null),
                    "prefs": migrated.get("prefs").cloned().unwrap_or(Value::Null),
                    "updatedAt": Utc::now().to_rfc3339()
                });
                let _ = self.ado.request_json("PUT", &put_url, Some(doc), false).await;
                return migrated;
            }
        }
        json!({})
    }

    async fn shared_boards(&self) -> Value {
        let url = format!("{}?api-version=3.1-preview.1", self.ado.extmgmt_boards_url());
        match self.ado.get(&url).await {
            Ok(v) => {
                let mut map = Map::new();
                let docs = if v.is_array() {
                    array(&v)
                } else {
                    array(&v["value"])
                };
                for doc in docs {
                    let entry = json!({
                        "layout": doc["layout"],
                        "notes": doc["notes"],
                        "prefs": doc["prefs"],
                        "updatedAt": doc["updatedAt"]
                    });
                    if let Some(email) = doc["email"].as_str().filter(|s| !s.is_empty()) {
                        map.insert(email.to_lowercase(), entry.clone());
                    }
                    if let Some(id) = doc["id"].as_str().filter(|s| !s.is_empty()) {
                        map.insert(id.to_lowercase(), entry);
                    }
                }
                Value::Object(map)
            }
            Err(_) => json!({}),
        }
    }

    async fn save_settings(&self, body: &Value) -> Result<Value> {
        let mut changed = false;
        let merged = {
            let mut cur = self.board_state.lock().unwrap();
            if !cur.is_object() {
                *cur = json!({});
            }
            let obj = cur.as_object_mut().unwrap();
            for key in ["layout", "notes", "prefs"] {
                if let Some(val) = body.get(key) {
                    if !val.is_null() {
                        obj.insert(key.to_owned(), val.clone());
                        changed = true;
                    }
                }
            }
            cur.clone()
        };
        if !changed {
            return Ok(json!({"ok":true,"unchanged":true}));
        }
        let (email, doc_id) = self.resolve_me_identity(None).await;
        let doc = json!({
            "id": doc_id,
            "__etag": -1,
            "email": email.to_lowercase(),
            "layout": merged.get("layout").cloned().unwrap_or(Value::Null),
            "notes": merged.get("notes").cloned().unwrap_or(Value::Null),
            "prefs": merged.get("prefs").cloned().unwrap_or(Value::Null),
            "updatedAt": Utc::now().to_rfc3339()
        });
        let url = format!("{}?api-version=3.1-preview.1", self.ado.extmgmt_boards_url());
        self.ado.request_json("PUT", &url, Some(doc), false).await?;
        Ok(json!({"ok":true}))
    }

    async fn overview(&self) -> Result<Value> {
        self.begin_progress(true);
        let result = self.build_overview().await;
        self.finish_progress();
        result
    }

    async fn build_overview(&self) -> Result<Value> {
        let wiql_path = format!("/{}/_apis/wit/wiql?api-version=7.1", self.ado.project_encoded());
        let board_path = format!(
            "/{}/{}/_apis/work/backlogs/Microsoft.FeatureCategory/workItems?api-version=7.1",
            self.ado.project_encoded(),
            enc(self.ado.team())
        );
        let sprint_flow = async {
            let t_sprints = Instant::now();
            self.step_active(
                "sprints",
                format!("Reading {}\\Sprint iterations…", self.ado.project()),
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
                .ado
                .request_json("POST", &wiql_path, Some(json!({"query":query})), false)
                .await?;
            let matched = array(&q["workItems"]).len();
            self.step_done("wiql", format!("{matched} assigned tickets matched"), t_wiql);
            Ok::<_, Error>((sprints, q))
        };
        let board_flow = async {
            let t_board = Instant::now();
            self.step_active("board", "Fetching Features board columns & state rules…");
            let (board, me, columns, states) = tokio::join!(
                self.ado.get(&board_path),
                self.ado.get("/_apis/connectionData"),
                self.feature_columns(),
                self.states()
            );
            let (board, me, columns, states) = (board?, me?, columns?, states?);
            let settings = self.settings(Some(&me)).await;
            let board_count = array(&board["workItems"]).len();
            let col_count = array(&columns).len();
            self.step_done(
                "board",
                format!("{board_count} board Features · {col_count} columns"),
                t_board,
            );
            Ok::<_, Error>((board, me, columns, states, settings))
        };
        let ((sprints, q), (board, me, columns, states, settings)) =
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
        let items: Vec<Value> = mine
            .iter()
            .map(|wi| {
                let f = &wi["fields"];
                let mut chain = Vec::new();
                let mut feature_id = None;
                let mut on_board = false;
                let mut cur = wi;
                for _ in 0..6 {
                    let Some(p) = parent(cur).and_then(|pid| all.get(&pid)) else {
                        break;
                    };
                    cur = p;
                    chain.push(json!({
                        "id":cur["id"],
                        "type":cur["fields"]["System.WorkItemType"],
                        "title":cur["fields"]["System.Title"],
                        "state":cur["fields"]["System.State"]
                    }));
                    if cur["fields"]["System.WorkItemType"] == "Feature" {
                        let fid = id(cur);
                        feature_id = Some(fid);
                        on_board = self.is_on_board(cur, &board_set);
                        features
                            .entry(fid)
                            .or_insert_with(|| self.feature(cur, on_board, &columns));
                        break;
                    }
                }
                let item_tags = tags(f);
                let item_children = children(wi);
                json!({
                    "id":wi["id"],
                    "type":f["System.WorkItemType"],
                    "title":f["System.Title"],
                    "state":f["System.State"],
                    "priority":f["Microsoft.VSTS.Common.Priority"],
                    "iterationPath":f["System.IterationPath"],
                    "assignedTo":person(&f["System.AssignedTo"]),
                    "tags":item_tags,
                    "weeksCarried":weeks_carried(&item_tags),
                    "changedDate":f["System.ChangedDate"],
                    "parentId":parent(wi),
                    "chain":chain,
                    "featureId":feature_id,
                    "onBoard":on_board,
                    "childCount":item_children.len(),
                    "openChildCount":item_children
                        .iter()
                        .filter(|cid| all.get(cid).is_some_and(|c| !is_closed_or_removed(&c["fields"]["System.State"])))
                        .count(),
                    "childrenKnown":item_children.iter().all(|cid| all.contains_key(cid)),
                    "url":self.ado.edit_url(id(wi))
                })
            })
            .collect();
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
            .items(&missing, false, Some(&FEATURE_BATCH_FIELDS))
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
        let (me_email, _) = self.resolve_me_identity(Some(&me)).await;
        self.step_done(
            "hierarchy",
            format!(
                "{parent_count} parents linked · {} Features ready",
                features.len()
            ),
            t_hierarchy,
        );
        Ok(json!({
            "me":{
                "name":me["authenticatedUser"]["providerDisplayName"],
                "id":me["authenticatedUser"]["id"],
                "email":me_email
            },
            "org":self.ado.org(),
            "project":self.ado.project(),
            "backlogPath":self.ado.backlog_path(),
            "sprints":sprints,
            "features":features,
            "featureColumns":columns,
            "items":items,
            "states":states,
            "settings":settings,
            "generatedAt":Utc::now().to_rfc3339()
        }))
    }

    async fn standup(&self, query_str: &str) -> Result<Value> {
        let mut requested_sprint: Option<String> = None;
        for (k, v) in url::form_urlencoded::parse(query_str.as_bytes()) {
            if k == "sprint" && !v.trim().is_empty() {
                requested_sprint = Some(v.trim().to_owned());
            }
        }
        let users: Vec<String> = STANDUP_USERS.iter().map(|s| (*s).to_owned()).collect();
        let wiql_path = format!("/{}/_apis/wit/wiql?api-version=7.1", self.ado.project_encoded());
        let board_path = format!(
            "/{}/{}/_apis/work/backlogs/Microsoft.FeatureCategory/workItems?api-version=7.1",
            self.ado.project_encoded(),
            enc(self.ado.team())
        );
        let (res, boards) = tokio::join!(
            async {
                tokio::try_join!(
                    self.sprints(),
                    self.ado.get(&board_path),
                    self.feature_columns()
                )
            },
            self.shared_boards()
        );
        let (sprints, board, columns) = res?;
        let sprint_path = match requested_sprint {
            Some(path) => path,
            None => array(&sprints)
                .iter()
                .find(|s| text(&s["timeFrame"]) == "current")
                .map(|s| text(&s["path"]).to_owned())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| self.ado.backlog_path()),
        };
        let query = standup_query(&users, &sprint_path);
        let q = self
            .ado
            .request_json("POST", &wiql_path, Some(json!({"query":query})), false)
            .await?;
        let ids: Vec<u64> = array(&q["workItems"]).iter().map(id).collect();
        let raw_items = self.items(&ids, true, None).await?;

        let mut all: HashMap<u64, Value> =
            raw_items.iter().map(|wi| (id(wi), wi.clone())).collect();
        let mut frontier: Vec<u64> = raw_items
            .iter()
            .filter_map(parent)
            .filter(|pid| !all.contains_key(pid))
            .collect();
        for _ in 0..6 {
            if frontier.is_empty() {
                break;
            }
            let fetched = self.items(&frontier, true, None).await?;
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
        let items: Vec<Value> = raw_items
            .iter()
            .map(|wi| {
                let f = &wi["fields"];
                let mut chain = Vec::new();
                let mut feature_id = None;
                let mut on_board = false;
                let mut cur = wi;
                for _ in 0..6 {
                    let Some(p) = parent(cur).and_then(|pid| all.get(&pid)) else {
                        break;
                    };
                    cur = p;
                    chain.push(json!({
                        "id":cur["id"],
                        "type":cur["fields"]["System.WorkItemType"],
                        "title":cur["fields"]["System.Title"],
                        "state":cur["fields"]["System.State"]
                    }));
                    if cur["fields"]["System.WorkItemType"] == "Feature" {
                        let fid = id(cur);
                        feature_id = Some(fid);
                        on_board = self.is_on_board(cur, &board_set);
                        features
                            .entry(fid)
                            .or_insert_with(|| self.feature(cur, on_board, &columns));
                        break;
                    }
                }
                let item_tags = tags(f);
                let item_children = children(wi);
                json!({
                    "id":wi["id"],
                    "type":f["System.WorkItemType"],
                    "title":f["System.Title"],
                    "state":f["System.State"],
                    "priority":f["Microsoft.VSTS.Common.Priority"],
                    "iterationPath":f["System.IterationPath"],
                    "assignedTo":person(&f["System.AssignedTo"]),
                    "tags":item_tags,
                    "weeksCarried":weeks_carried(&item_tags),
                    "changedDate":f["System.ChangedDate"],
                    "parentId":parent(wi),
                    "chain":chain,
                    "featureId":feature_id,
                    "onBoard":on_board,
                    "childCount":item_children.len(),
                    "openChildCount":item_children
                        .iter()
                        .filter(|cid| all.get(cid).is_some_and(|c| !is_closed_or_removed(&c["fields"]["System.State"])))
                        .count(),
                    "childrenKnown":item_children.iter().all(|cid| all.contains_key(cid)),
                    "url":self.ado.edit_url(id(wi))
                })
            })
            .collect();
        let mut features: Vec<Value> = features.into_values().collect();
        features.sort_by_key(id);
        {
            let mut nodes = self.nodes.lock().unwrap();
            for wi in all.values() {
                let wid = id(wi);
                if wid > 0 {
                    nodes.insert(wid, (self.summary(wi), parent(wi)));
                }
            }
        }
        Ok(json!({
            "sprintPath":sprint_path,
            "items":items,
            "features":features,
            "boards":boards,
            "generatedAt":Utc::now().to_rfc3339()
        }))
    }

    fn map_search_item(&self, wi: &Value) -> Value {
        let f = &wi["fields"];
        let assigned = person(&f["System.AssignedTo"]);
        let is_team = is_standup_member(&assigned);
        json!({
            "id": wi["id"],
            "type": f["System.WorkItemType"],
            "title": f["System.Title"],
            "state": f["System.State"],
            "priority": f["Microsoft.VSTS.Common.Priority"],
            "iterationPath": f["System.IterationPath"],
            "assignedTo": assigned,
            "changedDate": f["System.ChangedDate"],
            "createdDate": f["System.CreatedDate"],
            "tags": tags(f),
            "isTeamMember": is_team,
            "url": self.ado.edit_url(id(wi))
        })
    }

    async fn get_team_pool(&self) -> Vec<Value> {
        if let Some((ts, cached)) = self.team_pool.lock().unwrap().as_ref() {
            if ts.elapsed().as_secs() < 45 {
                return cached.clone();
            }
        }
        let emails: Vec<String> = STANDUP_USERS.iter().map(|u| format!("'{u}'")).collect();
        let wiql_path = format!(
            "/{}/_apis/wit/wiql?$top=160&api-version=7.1",
            self.ado.project_encoded()
        );
        let query = format!(
            "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] IN ({}) AND [System.WorkItemType] IN ('Task','Bug','User Story','Feature') AND [System.State] <> 'Removed' AND ([System.State] NOT IN ('Closed','Done') OR [System.ChangedDate] >= @Today - 90) ORDER BY [System.ChangedDate] DESC",
            emails.join(",")
        );
        let Ok(res) = self
            .ado
            .request_json("POST", &wiql_path, Some(json!({"query": query})), false)
            .await
        else {
            return Vec::new();
        };
        let ids: Vec<u64> = array(&res["workItems"])
            .iter()
            .map(id)
            .filter(|w| *w > 0)
            .take(160)
            .collect();
        if ids.is_empty() {
            return Vec::new();
        }
        let Ok(fetched) = self.items(&ids, false, Some(&SEARCH_FIELDS)).await else {
            return Vec::new();
        };
        let mut pool: Vec<Value> = fetched.iter().map(|wi| self.map_search_item(wi)).collect();
        pool.sort_by(|a, b| recency_ts(b).cmp(recency_ts(a)));
        *self.team_pool.lock().unwrap() = Some((Instant::now(), pool.clone()));
        pool
    }

    async fn search(&self, query_str: &str) -> Result<Value> {
        let mut q = String::new();
        for (k, v) in url::form_urlencoded::parse(query_str.as_bytes()) {
            if k == "q" {
                q = v.trim().to_owned();
            }
        }
        let parsed_id = parse_search_ticket_id(&q);
        let words: Vec<String> = q
            .to_lowercase()
            .split_whitespace()
            .map(str::to_owned)
            .collect();

        if q.is_empty() {
            let pool = self.get_team_pool().await;
            let items: Vec<Value> = pool.into_iter().take(50).collect();
            return Ok(json!({"items": items}));
        }

        // Run Stand Up team pool lookup and SAN SA almsearch/ID lookup in parallel
        let remote_fut = async {
            let mut ids: Vec<u64> = Vec::new();
            if let Some(pid) = parsed_id {
                ids.push(pid);
            }
            if parsed_id.is_none_or(|pid| pid < 1_000_000) {
                let search_text = parsed_id.map(|pid| pid.to_string()).unwrap_or_else(|| q.clone());
                let search_body = json!({
                    "searchText": search_text,
                    "$skip": 0,
                    "$top": 35,
                    "filters": {
                        "System.TeamProject": [self.ado.project()]
                    }
                });
                if let Ok(res) = self
                    .ado
                    .request_json("POST", &self.ado.almsearch_url(), Some(search_body), false)
                    .await
                {
                    for hit in array(&res["results"]).iter().take(35) {
                        let wid = hit["fields"]["system.id"]
                            .as_str()
                            .and_then(|s| s.parse::<u64>().ok())
                            .or_else(|| hit["fields"]["system.id"].as_u64())
                            .unwrap_or(0);
                        if wid > 0 && !ids.contains(&wid) {
                            ids.push(wid);
                        }
                    }
                }
            }
            if ids.is_empty() {
                return Vec::new();
            }
            match self.items(&ids, false, Some(&SEARCH_FIELDS)).await {
                Ok(fetched) => fetched.iter().map(|wi| self.map_search_item(wi)).collect(),
                Err(_) => Vec::new(),
            }
        };

        let (team_pool, remote_items) = tokio::join!(self.get_team_pool(), remote_fut);

        let mut seen = HashSet::new();
        let mut team_hits: Vec<Value> = Vec::new();
        let mut other_hits: Vec<Value> = Vec::new();

        for item in team_pool {
            if matches_search_words(&item, &words, parsed_id) {
                let wid = id(&item);
                if wid > 0 && seen.insert(wid) {
                    team_hits.push(item);
                }
            }
        }
        for item in remote_items {
            let wid = id(&item);
            if wid == 0 || !seen.insert(wid) {
                continue;
            }
            if item["isTeamMember"].as_bool().unwrap_or(false) {
                team_hits.push(item);
            } else {
                other_hits.push(item);
            }
        }

        // Sort Stand Up team tickets by recency (most recently modified or created first; exact ID match on top)
        team_hits.sort_by(|a, b| {
            let a_exact = parsed_id.is_some_and(|pid| id(a) == pid);
            let b_exact = parsed_id.is_some_and(|pid| id(b) == pid);
            b_exact
                .cmp(&a_exact)
                .then_with(|| recency_ts(b).cmp(recency_ts(a)))
        });

        // Sort other SAN SA tickets by recency (exact ID match on top)
        other_hits.sort_by(|a, b| {
            let a_exact = parsed_id.is_some_and(|pid| id(a) == pid);
            let b_exact = parsed_id.is_some_and(|pid| id(b) == pid);
            b_exact
                .cmp(&a_exact)
                .then_with(|| recency_ts(b).cmp(recency_ts(a)))
        });

        let mut items: Vec<Value> = Vec::with_capacity(team_hits.len() + other_hits.len());
        // If user typed an exact ID of a non-team ticket, keep that exact ticket at index 0
        if let Some(pid) = parsed_id {
            if let Some(pos) = other_hits.iter().position(|it| id(it) == pid) {
                items.push(other_hits.remove(pos));
            }
        }
        items.extend(team_hits.into_iter().take(40));
        items.extend(other_hits.into_iter().take(30));

        Ok(json!({"items": items}))
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
            let cached = self.nodes.lock().unwrap().get(&p).cloned();
            if let Some((summary, next_parent)) = cached {
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
        map_pr(pr, self.ado.org(), self.ado.project())
    }

    async fn fetch_github_pr(
        &self,
        host: &str,
        owner: &str,
        repo: &str,
        pr_id: u64,
    ) -> Option<Value> {
        let mut cmd = tokio::process::Command::new("gh");
        #[cfg(windows)]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        if !host.eq_ignore_ascii_case("github.com") {
            cmd.env_remove("GH_TOKEN");
            cmd.env_remove("GITHUB_TOKEN");
        }
        cmd.args([
            "api",
            "--hostname",
            host,
            &format!("repos/{owner}/{repo}/pulls/{pr_id}"),
        ]);
        let output = tokio::time::timeout(std::time::Duration::from_secs(5), cmd.output())
            .await
            .ok()?
            .ok()?;
        if !output.status.success() {
            return None;
        }
        serde_json::from_slice::<Value>(&output.stdout).ok()
    }

    async fn pull_requests(&self, wi: &Value) -> Vec<Value> {
        enum PrTask {
            Ado {
                artifact: String,
                path: String,
                pr_id: u64,
            },
            GitHub {
                host: String,
                owner: String,
                repo: String,
                pr_id: u64,
                canonical_url: String,
                comment: Option<String>,
            },
        }

        let mut specs = Vec::new();
        for relation in array(&wi["relations"]) {
            let rel = text(&relation["rel"]);
            let url_str = text(&relation["url"]);
            if rel == "ArtifactLink" {
                if let Some(parts) = PR_ARTIFACT.captures(url_str) {
                    let path = format!(
                        "/{}/_apis/git/repositories/{}/pullrequests/{}?api-version=7.1",
                        enc(&parts[1]),
                        enc(&parts[2]),
                        &parts[3]
                    );
                    if let Ok(pr_id) = parts[3].parse::<u64>() {
                        specs.push(PrTask::Ado {
                            artifact: url_str.to_owned(),
                            path,
                            pr_id,
                        });
                    }
                }
            } else if rel == "Hyperlink" {
                if let Some((host, owner, repo, pr_id, canonical_url)) =
                    parse_github_pr_url(url_str)
                {
                    let comment = relation["attributes"]["comment"]
                        .as_str()
                        .map(str::to_owned);
                    specs.push(PrTask::GitHub {
                        host,
                        owner,
                        repo,
                        pr_id,
                        canonical_url,
                        comment,
                    });
                }
            }
        }

        let tasks: Vec<_> = specs
            .into_iter()
            .map(|spec| async move {
                match spec {
                    PrTask::Ado {
                        artifact,
                        path,
                        pr_id,
                    } => match self.ado.get(&path).await {
                        Ok(pr) => {
                            let mut v = self.pr(&pr);
                            v["artifact"] = json!(artifact);
                            v
                        }
                        Err(error) => json!({
                            "id": pr_id,
                            "artifact": artifact,
                            "error": if error.status == 404 {
                                "Not found or no access".to_owned()
                            } else {
                                error.error
                            }
                        }),
                    },
                    PrTask::GitHub {
                        host,
                        owner,
                        repo,
                        pr_id,
                        canonical_url,
                        comment,
                    } => {
                        let gh = self.fetch_github_pr(&host, &owner, &repo, pr_id).await;
                        map_github_pr(
                            gh.as_ref(),
                            &owner,
                            &repo,
                            pr_id,
                            &canonical_url,
                            comment.as_deref(),
                        )
                    }
                }
            })
            .collect();

        let mut prs = join_all(tasks).await;
        sort_pull_requests(&mut prs);
        prs
    }

    async fn detail(&self, id: u64) -> Result<Value> {
        let comments_path = format!(
            "/{}/_apis/wit/workItems/{id}/comments?$top=200&order=desc&api-version={COMMENTS_API}",
            self.ado.project_encoded()
        );
        let (wi, comments) =
            tokio::try_join!(self.ado.workitem(id), self.ado.get(&comments_path))?;
        let (ancestors, children, prs) = tokio::join!(
            self.ancestors(&wi),
            self.child_items(&wi),
            self.pull_requests(&wi)
        );
        let (ancestors, children) = (ancestors?, children?);
        let f = &wi["fields"];
        let fields: Map<String, Value> = RICH
            .iter()
            .map(|r| ((*r).to_string(), f[*r].clone()))
            .collect();
        let markdown: Vec<&str> = RICH
            .iter()
            .copied()
            .filter(|r| text(&wi["multilineFieldsFormat"][*r]).eq_ignore_ascii_case("markdown"))
            .collect();
        let mapped: Vec<Value> = array(&comments["comments"]).iter().map(comment).collect();
        Ok(json!({
            "id":wi["id"],
            "rev":wi["rev"],
            "url":self.ado.edit_url(id),
            "type":f["System.WorkItemType"],
            "title":f["System.Title"],
            "state":f["System.State"],
            "reason":f["System.Reason"],
            "iterationPath":f["System.IterationPath"],
            "areaPath":f["System.AreaPath"],
            "tags":tags(f),
            "assignedTo":person(&f["System.AssignedTo"]),
            "createdBy":person(&f["System.CreatedBy"]),
            "createdDate":f["System.CreatedDate"],
            "changedBy":person(&f["System.ChangedBy"]),
            "changedDate":f["System.ChangedDate"],
            "priority":f["Microsoft.VSTS.Common.Priority"],
            "parent":ancestors.last(),
            "ancestors":ancestors,
            "childCount":children.len(),
            "children":children,
            "pullRequests":prs,
            "fields":fields,
            "markdown":markdown,
            "commentCount":comments["totalCount"].as_u64().unwrap_or(mapped.len() as u64),
            "comments":mapped
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
            let backlog = self.ado.backlog_path();
            if iteration.starts_with(&format!("{backlog}\\")) {
                let wi = self
                    .ado
                    .get(&format!(
                        "/_apis/wit/workitems/{id}?fields=System.WorkItemType&api-version=7.1"
                    ))
                    .await?;
                if !is_sprintable(text(&wi["fields"]["System.WorkItemType"])) {
                    return Err(Error::new(
                        400,
                        format!(
                            "Stories and Features stay in {backlog}; only Tasks and Bugs go into sprints."
                        ),
                    ));
                }
            }
            add(&mut ops, "/fields/System.IterationPath", iteration);
        }
        if let Some(state) = body["state"].as_str().filter(|s| !s.is_empty()) {
            add(&mut ops, "/fields/System.State", state);
        }
        if let Some(priority) = body.get("priority").and_then(Value::as_u64) {
            let priority = validate_priority(priority)?;
            add(&mut ops, "/fields/Microsoft.VSTS.Common.Priority", priority);
        }
        if let Some(tag_list) = body["tags"].as_array() {
            let cleaned = normalize_tags(tag_list);
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
            let wi = self.ado.workitem(id).await?;
            if let Some(index) = array(&wi["relations"])
                .iter()
                .position(|r| r["rel"] == "System.LinkTypes.Hierarchy-Reverse")
            {
                ops.push(json!({"op":"remove","path":format!("/relations/{index}")}));
            }
            if !body["parentId"].is_null() {
                let parent_id = body["parentId"]
                    .as_u64()
                    .filter(|pid| *pid > 0)
                    .ok_or_else(|| Error::new(400, "Invalid parent ID"))?;
                add(
                    &mut ops,
                    "/relations/-",
                    json!({
                        "rel":"System.LinkTypes.Hierarchy-Reverse",
                        "url":format!("{}/_apis/wit/workItems/{parent_id}", self.ado.org())
                    }),
                );
            }
        }
        if ops.is_empty() {
            return Ok(json!({"ok":true,"unchanged":true}));
        }
        let wi = self.ado.patch_workitem(id, ops).await.map_err(|e| {
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
        Ok(json!({
            "id":wi["id"],
            "rev":wi["rev"],
            "title":wi["fields"]["System.Title"],
            "state":wi["fields"]["System.State"],
            "priority":wi["fields"]["Microsoft.VSTS.Common.Priority"],
            "iterationPath":wi["fields"]["System.IterationPath"],
            "tags":tags(&wi["fields"])
        }))
    }

    async fn move_feature(&self, id: u64, body: &Value) -> Result<Value> {
        let name = required(body, "column")?;
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
        let wi = self.ado.patch_workitem(id, ops).await?;
        Ok(json!({
            "id":wi["id"],
            "state":wi["fields"]["System.State"],
            "column":wi["fields"][COLUMN].as_str().unwrap_or(name)
        }))
    }

    async fn link_pr(&self, id: u64, body: &Value) -> Result<Value> {
        match parse_pr_ref(required(body, "ref")?, self.ado.project())? {
            PrRef::Ado { project, pr_id } => {
                let pr = self
                    .ado
                    .get(&format!(
                        "/{}/_apis/git/pullrequests/{pr_id}?api-version=7.1",
                        enc(&project)
                    ))
                    .await?;
                let repo = &pr["repository"];
                let project_id = required(&repo["project"], "id")?;
                let repo_id = required(repo, "id")?;
                let artifact =
                    format!("vstfs:///Git/PullRequestId/{project_id}%2F{repo_id}%2F{pr_id}");
                let wi = self.ado.workitem(id).await?;
                if array(&wi["relations"]).iter().any(|r| {
                    r["rel"] == "ArtifactLink" && text(&r["url"]).eq_ignore_ascii_case(&artifact)
                }) {
                    return Err(Error::new(409, format!("PR {pr_id} is already linked")));
                }
                let mut ops = Vec::new();
                test_revision(&mut ops, &wi["rev"]);
                add(
                    &mut ops,
                    "/relations/-",
                    json!({"rel":"ArtifactLink","url":artifact,"attributes":{"name":"Pull Request"}}),
                );
                let updated = self.ado.patch_workitem(id, ops).await?;
                let mut mapped = self.pr(&pr);
                mapped["artifact"] = json!(artifact);
                Ok(json!({"rev":updated["rev"],"pullRequest":mapped}))
            }
            PrRef::GitHub {
                host,
                owner,
                repo,
                pr_id,
                url,
            } => {
                let wi = self.ado.workitem(id).await?;
                if array(&wi["relations"]).iter().any(|r| {
                    r["rel"] == "Hyperlink" && text(&r["url"]).eq_ignore_ascii_case(&url)
                }) {
                    return Err(Error::new(
                        409,
                        format!("GitHub PR #{pr_id} is already linked"),
                    ));
                }
                let gh = self.fetch_github_pr(&host, &owner, &repo, pr_id).await;
                let mapped = map_github_pr(gh.as_ref(), &owner, &repo, pr_id, &url, None);
                let comment_title: String = text(&mapped["title"]).chars().take(240).collect();
                let mut ops = Vec::new();
                test_revision(&mut ops, &wi["rev"]);
                add(
                    &mut ops,
                    "/relations/-",
                    json!({
                        "rel": "Hyperlink",
                        "url": url,
                        "attributes": {
                            "comment": comment_title
                        }
                    }),
                );
                let updated = self.ado.patch_workitem(id, ops).await?;
                Ok(json!({"rev":updated["rev"],"pullRequest":mapped}))
            }
        }
    }

    async fn unlink_pr(&self, id: u64, body: &Value) -> Result<Value> {
        let artifact = required(body, "artifact")?;
        let wi = self.ado.workitem(id).await?;
        let Some(index) = array(&wi["relations"]).iter().position(|r| {
            matches!(text(&r["rel"]), "ArtifactLink" | "Hyperlink")
                && text(&r["url"]).eq_ignore_ascii_case(artifact)
        }) else {
            return Ok(json!({"rev":wi["rev"],"unchanged":true}));
        };
        let mut ops = Vec::new();
        test_revision(&mut ops, &wi["rev"]);
        ops.push(json!({"op":"remove","path":format!("/relations/{index}")}));
        let updated = self.ado.patch_workitem(id, ops).await?;
        Ok(json!({"rev":updated["rev"]}))
    }

    pub async fn attachment(&self, input: &str) -> Result<Value> {
        self.ado.attachment(input).await
    }

    pub async fn request(self: Arc<Self>, method: &str, url: &str, body: Value) -> Result<Value> {
        let (path_part, query_part) = url.split_once('?').unwrap_or((url, ""));
        let parts: Vec<&str> = path_part.trim_start_matches('/').split('/').collect();
        match (method, parts.as_slice()) {
            ("GET", ["progress"]) => Ok(self.progress_snapshot()),
            ("GET", ["auth", "status"]) => {
                self.begin_progress(false);
                let t0 = Instant::now();
                self.step_active(
                    "auth",
                    format!("Acquiring Azure CLI token for {}…", self.ado.project()),
                );
                let token_res = self.ado.auth().token().await;
                if token_res.is_ok() {
                    self.step_active("auth", format!("Verifying {} session…", self.ado.project()));
                }
                let result = match token_res {
                    Ok(_) => self.ado.get("/_apis/connectionData").await,
                    Err(e) => Err(e),
                };
                let method = self.ado.auth().method().await;
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
                        json!({
                            "signedIn":true,
                            "method":method,
                            "user":me["authenticatedUser"]["providerDisplayName"],
                            "org":self.ado.org()
                        })
                    }
                    Err(error) => {
                        self.finish_progress();
                        json!({
                            "signedIn":false,
                            "method":method,
                            "error":error.error,
                            "org":self.ado.org()
                        })
                    }
                })
            }
            ("POST", ["auth", "cli"]) => {
                self.ado.auth().sign_in_cli().await?;
                let me = self.ado.get("/_apis/connectionData").await?;
                Ok(json!({
                    "ok": true,
                    "user": me["authenticatedUser"]["providerDisplayName"]
                }))
            }
            ("POST", ["auth", "device"]) => self.ado.auth().start_device().await,
            ("GET", ["auth", "device"]) => Ok(self.ado.auth().poll_device().await),
            ("GET", ["overview"]) => self.overview().await,
            ("GET", ["standup"]) => self.standup(query_part).await,
            ("GET", ["search"]) => self.search(query_part).await,
            ("GET", ["settings"]) => Ok(self.settings(None).await),
            ("PATCH", ["settings"]) => self.save_settings(&body).await,
            ("GET", ["sprints"]) => self.sprints().await,
            ("PATCH", ["features", work_id, "column"]) => {
                self.move_feature(positive_id(work_id)?, &body).await
            }
            ("GET", ["workitems", work_id]) => self.detail(positive_id(work_id)?).await,
            ("PATCH", ["workitems", work_id]) => self.update(positive_id(work_id)?, &body).await,
            ("GET", ["workitems", work_id, "ancestors"]) => {
                let wi = self.ado.workitem(positive_id(work_id)?).await?;
                Ok(json!({"ancestors":self.ancestors(&wi).await?}))
            }
            ("GET", ["workitems", work_id, "children"]) => {
                let wi = self.ado.workitem(positive_id(work_id)?).await?;
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
                    .ado
                    .request_json(
                        "POST",
                        &format!(
                            "/{}/_apis/wit/workItems/{id}/comments?api-version={COMMENTS_API}",
                            self.ado.project_encoded()
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
                let value = self
                    .ado
                    .request_json(
                        "PATCH",
                        &format!(
                            "/{}/_apis/wit/workItems/{id}/comments/{cid}?api-version={COMMENTS_API}{fmt}",
                            self.ado.project_encoded()
                        ),
                        Some(json!({"text":text})),
                        false,
                    )
                    .await?;
                Ok(comment(&value))
            }
            _ => Err(Error::new(
                404,
                format!("Unknown planner operation: {method} {url}"),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{
        matchers::{body_json, method, path},
        Mock, MockServer, ResponseTemplate,
    };

    fn mocked(server: &MockServer) -> Arc<PlannerService> {
        PlannerService::for_test(server.uri())
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
        respond(
            &server,
            "GET",
            "/_apis/wit/workitems/10",
            json!({
                "id":10,"rev":3,"fields":{"System.WorkItemType":"Task","System.Title":"Synthetic task","System.State":"Active",
                    "System.Tags":"Backend; 20260101","System.Description":"# Description"},
                "multilineFieldsFormat":{"System.Description":"Markdown"},
                "relations":[
                    {"rel":"System.LinkTypes.Hierarchy-Reverse","url":format!("{}/2",server.uri())},
                    {"rel":"System.LinkTypes.Hierarchy-Forward","url":format!("{}/20",server.uri())},
                    {"rel":"ArtifactLink","url":"vstfs:///Git/PullRequestId/project%2Frepo%2F7"}
                ]
            }),
        )
        .await;
        respond(
            &server,
            "GET",
            "/Test%20Project/_apis/wit/workItems/10/comments",
            json!({
                "totalCount":1,"comments":[{"id":1,"text":"Synthetic comment","format":"Markdown"}]
            }),
        )
        .await;
        Mock::given(method("POST"))
            .and(path("/Test%20Project/_apis/wit/workitemsbatch"))
            .and(body_json(
                json!({"ids":[2],"errorPolicy":"omit","$expand":"relations"}),
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"value":[{"id":2,"fields":{
                "System.Title":"Synthetic feature","System.WorkItemType":"Feature","System.State":"Active"}}]})))
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/Test%20Project/_apis/wit/workitemsbatch"))
            .and(body_json(json!({"ids":[20],"errorPolicy":"omit"})))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"value":[{"id":20,"fields":{
                "System.Title":"Synthetic child","System.WorkItemType":"Task","System.State":"Closed"}}]})))
            .expect(1)
            .mount(&server)
            .await;
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
                ResponseTemplate::new(200).set_body_json(
                    json!({"id":10,"rev":4,"fields":{"System.Tags":"FY26 C5; Backend; Sprint-Unplanned"}}),
                ),
            )
            .expect(1)
            .mount(&server)
            .await;
        let result = mocked(&server)
            .request(
                "PATCH",
                "/workitems/10",
                json!({
                    "rev":3,"fields":{"System.Description":"# Updated"},"markdown":["System.Description"],
                    "tags":["FY26 C5","Backend","Sprint-Unplanned"]
                }),
            )
            .await
            .unwrap();
        assert_eq!(result["rev"], 4);
        assert_eq!(
            result["tags"],
            json!(["FY26 C5", "Backend", "Sprint-Unplanned"])
        );
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

    #[tokio::test]
    async fn settings_get_and_patch_roundtrip_layout_notes_and_prefs() {
        let server = MockServer::start().await;
        respond(
            &server,
            "GET",
            "/_apis/connectionData",
            json!({"authenticatedUser":{"id":"u1","providerDisplayName":"Raul","properties":{"Account":{"$value":"raulpo@microsoft.com"}}}}),
        )
        .await;
        respond(
            &server,
            "GET",
            "/_apis/ExtensionManagement/InstalledExtensions/ms/vss-aex-platform/Data/Scopes/Default/Current/Collections/TicketsPlannerBoards/Documents/raulpo",
            json!({"id":"raulpo","email":"raulpo@microsoft.com","prefs":{"theme":"dark"}}),
        )
        .await;
        Mock::given(method("PUT"))
            .and(path("/_apis/ExtensionManagement/InstalledExtensions/ms/vss-aex-platform/Data/Scopes/Default/Current/Collections/TicketsPlannerBoards/Documents"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"id":"raulpo","__etag":2})))
            .expect(1)
            .mount(&server)
            .await;

        let backend = mocked(&server);
        let fetched = backend
            .clone()
            .request("GET", "/settings", Value::Null)
            .await
            .unwrap();
        assert_eq!(fetched["prefs"]["theme"], "dark");

        let empty_save = backend
            .clone()
            .request("PATCH", "/settings", json!({}))
            .await
            .unwrap();
        assert_eq!(empty_save["unchanged"], true);

        let saved = backend
            .request(
                "PATCH",
                "/settings",
                json!({
                    "layout": {"items":{"1":{"col":"Sprint","px":10,"y":20}}},
                    "prefs": {"theme":"dark"}
                }),
            )
            .await
            .unwrap();
        assert_eq!(saved["ok"], true);
    }

    #[tokio::test]
    async fn updating_priority_accepts_zero_and_rejects_five() {
        let server = MockServer::start().await;
        Mock::given(method("PATCH"))
            .and(path("/_apis/wit/workitems/10"))
            .and(body_json(json!([{
                "op":"add",
                "path":"/fields/Microsoft.VSTS.Common.Priority",
                "value":0
            }])))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "id":10,"rev":5,"fields":{"Microsoft.VSTS.Common.Priority":0}
            })))
            .expect(1)
            .mount(&server)
            .await;
        let backend = mocked(&server);
        let updated = backend
            .clone()
            .request("PATCH", "/workitems/10", json!({"priority": 0}))
            .await
            .unwrap();
        assert_eq!(updated["priority"], 0);

        let err = backend
            .request("PATCH", "/workitems/10", json!({"priority": 5}))
            .await
            .unwrap_err();
        assert_eq!(err.status, 400);
    }

    #[test]
    fn parse_search_ticket_id_handles_numbers_hashes_ab_prefix_and_urls() {
        assert_eq!(parse_search_ticket_id("11254816"), Some(11254816));
        assert_eq!(parse_search_ticket_id("#11254816"), Some(11254816));
        assert_eq!(parse_search_ticket_id("AB#11254816"), Some(11254816));
        assert_eq!(parse_search_ticket_id("ab#11254816"), Some(11254816));
        assert_eq!(
            parse_search_ticket_id("https://msasg.visualstudio.com/SAN%20SA/_workitems/edit/11254816"),
            Some(11254816)
        );
        assert_eq!(parse_search_ticket_id("android crash"), None);
    }
}
