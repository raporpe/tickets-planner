use crate::{
    domain::{
        error::{enc, Error, Result},
        work_item::array,
    },
    infrastructure::auth::Auth,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{collections::HashSet, env, sync::Arc, time::Duration as Timeout};
use url::Url;

pub struct AdoClient {
    client: reqwest::Client,
    auth: Arc<Auth>,
    org: String,
    project: String,
    team: String,
    sprint_root: String,
}

impl AdoClient {
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
            project,
            team: env::var("ADO_TEAM_ID")
                .unwrap_or_else(|_| "4271a5b2-919a-44ce-a87d-ef4c4d823a21".into()),
            sprint_root: env::var("ADO_SPRINT_ROOT").unwrap_or_else(|_| "Sprint".into()),
        })
    }

    #[cfg(test)]
    pub fn for_test(uri: String) -> Self {
        let client = reqwest::Client::new();
        Self {
            auth: Arc::new(Auth::for_test(client.clone())),
            client,
            org: uri,
            project: "Test Project".into(),
            team: "test-team".into(),
            sprint_root: "Sprint".into(),
        }
    }

    pub fn auth(&self) -> &Arc<Auth> {
        &self.auth
    }

    pub fn org(&self) -> &str {
        &self.org
    }

    pub fn project(&self) -> &str {
        &self.project
    }

    pub fn team(&self) -> &str {
        &self.team
    }

    pub fn sprint_root(&self) -> &str {
        &self.sprint_root
    }

    pub fn project_encoded(&self) -> String {
        enc(&self.project)
    }

    pub fn backlog_path(&self) -> String {
        format!("{}\\{}", self.project, self.sprint_root)
    }

    pub fn edit_url(&self, id: u64) -> String {
        format!("{}/{}/_workitems/edit/{id}", self.org, self.project_encoded())
    }

    pub fn extmgmt_boards_url(&self) -> String {
        let base = if self.org.eq_ignore_ascii_case("https://msasg.visualstudio.com") {
            "https://extmgmt.dev.azure.com/msasg".to_owned()
        } else {
            self.org.clone()
        };
        format!(
            "{base}/_apis/ExtensionManagement/InstalledExtensions/ms/vss-aex-platform/Data/Scopes/Default/Current/Collections/TicketsPlannerBoards/Documents"
        )
    }

    pub fn almsearch_url(&self) -> String {
        let base = if self.org.eq_ignore_ascii_case("https://msasg.visualstudio.com") {
            "https://almsearch.dev.azure.com/msasg".to_owned()
        } else {
            self.org.clone()
        };
        format!(
            "{base}/{}/_apis/search/workitemsearchresults?api-version=7.1",
            self.project_encoded()
        )
    }

    pub async fn request_json(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
        patch: bool,
    ) -> Result<Value> {
        let url = if path.starts_with("https://") || path.starts_with("http://") {
            path.to_owned()
        } else {
            format!("{}{path}", self.org)
        };
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
            let detail = format!(
                "Azure DevOps ({}) rejected the token (HTTP {status}) on {path}. Ensure Azure CLI is signed into the Microsoft tenant (`az login --tenant 72f988bf-86f1-41af-91ab-2d7cd011db47`).",
                self.org
            );
            eprintln!("[auth] {detail}");
            return Err(Error::new(401, detail));
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

    pub async fn get(&self, path: &str) -> Result<Value> {
        self.request_json("GET", path, None, false).await
    }

    pub async fn patch_workitem(&self, id: u64, ops: Vec<Value>) -> Result<Value> {
        self.request_json(
            "PATCH",
            &format!("/_apis/wit/workitems/{id}?api-version=7.1"),
            Some(json!(ops)),
            true,
        )
        .await
    }

    pub async fn workitem(&self, id: u64) -> Result<Value> {
        self.get(&format!(
            "/_apis/wit/workitems/{id}?$expand=relations&api-version=7.1"
        ))
        .await
    }

    pub async fn items_batch<F>(
        &self,
        ids: &[u64],
        relations: bool,
        fields: Option<&[&str]>,
        mut on_chunk: F,
    ) -> Result<Vec<Value>>
    where
        F: FnMut(usize, usize, usize, usize),
    {
        let mut seen = HashSet::new();
        let unique: Vec<u64> = ids.iter().copied().filter(|id| seen.insert(*id)).collect();
        let total = unique.len();
        let chunks: Vec<&[u64]> = unique.chunks(200).collect();
        let chunk_count = chunks.len();
        let mut out = Vec::new();
        for (idx, chunk) in chunks.into_iter().enumerate() {
            on_chunk(
                idx + 1,
                chunk_count,
                (out.len() + chunk.len()).min(total),
                total,
            );
            let mut body = json!({"ids":chunk,"errorPolicy":"omit"});
            if relations {
                body["$expand"] = json!("relations");
            } else if let Some(fields) = fields {
                body["fields"] = json!(fields);
            }
            let value = self
                .request_json(
                    "POST",
                    &format!(
                        "/{}/_apis/wit/workitemsbatch?api-version=7.1",
                        self.project_encoded()
                    ),
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

    pub async fn attachment(&self, input: &str) -> Result<Value> {
        let url = Url::parse(input).map_err(|_| Error::new(400, "Invalid attachment URL"))?;
        let org = Url::parse(&self.org).map_err(|_| Error::new(400, "Invalid organization URL"))?;
        let path_lower = url.path().to_lowercase();
        if url.origin() != org.origin()
            || (!path_lower.contains("/_apis/wit/attachments/")
                && !path_lower.contains("/_apis/graphprofile/memberavatars/"))
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
            .split(';')
            .next()
            .unwrap_or("application/octet-stream")
            .trim()
            .to_owned();
        if !matches!(
            mime.as_str(),
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
}
