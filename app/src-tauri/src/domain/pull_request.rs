use crate::domain::{
    error::{enc, positive_id, Error, Result},
    work_item::{id, person, text},
};
use regex::Regex;
use serde_json::{json, Value};
use std::sync::LazyLock;
use url::Url;

pub static PR_ARTIFACT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^vstfs:///Git/PullRequestId/([^%/]+)(?:%2F|/)([^%/]+)(?:%2F|/)(\d+)$").unwrap()
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrRef {
    Ado {
        project: String,
        pr_id: u64,
    },
    GitHub {
        host: String,
        owner: String,
        repo: String,
        pr_id: u64,
        url: String,
    },
}

pub fn parse_github_pr_url(input: &str) -> Option<(String, String, String, u64, String)> {
    let url = Url::parse(input.trim()).ok()?;
    if !matches!(url.scheme(), "https" | "http") {
        return None;
    }
    let host = url.host_str()?.to_lowercase();
    let segments: Vec<_> = url
        .path_segments()?
        .filter(|s| !s.is_empty())
        .collect();
    if segments.len() >= 4 && matches!(segments[2].to_lowercase().as_str(), "pull" | "pulls") {
        let owner = segments[0].to_owned();
        let repo = segments[1].to_owned();
        let pr_id = positive_id(segments[3]).ok()?;
        let canonical = format!("https://{host}/{owner}/{repo}/pull/{pr_id}");
        return Some((host, owner, repo, pr_id, canonical));
    }
    None
}

pub fn parse_pr_ref(input: &str, project: &str) -> Result<PrRef> {
    let trimmed = input.trim();
    let bare = trimmed.strip_prefix('!').unwrap_or(trimmed);
    if let Ok(pr_id) = positive_id(bare) {
        return Ok(PrRef::Ado {
            project: project.to_owned(),
            pr_id,
        });
    }
    if let Some((host, owner, repo, pr_id, url)) = parse_github_pr_url(trimmed) {
        return Ok(PrRef::GitHub {
            host,
            owner,
            repo,
            pr_id,
            url,
        });
    }
    if let Ok(url) = Url::parse(trimmed) {
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
                    if let Some(pr_id) = segments.get(index + 3) {
                        return Ok(PrRef::Ado {
                            project,
                            pr_id: positive_id(pr_id)?,
                        });
                    }
                }
            }
        }
    }
    Err(Error::new(
        400,
        "Paste a GitHub PR URL (.../owner/repo/pull/123), an Azure DevOps PR URL (.../_git/repo/pullrequest/123), or a PR number",
    ))
}

pub fn map_github_pr(
    gh: Option<&Value>,
    owner: &str,
    repo: &str,
    pr_id: u64,
    canonical_url: &str,
    fallback_comment: Option<&str>,
) -> Value {
    let full_repo = format!("{owner}/{repo}");
    if let Some(pr) = gh {
        let is_merged = pr["merged"] == true || !pr["merged_at"].is_null();
        let state_str = text(&pr["state"]);
        let status = if is_merged {
            "completed"
        } else if state_str.eq_ignore_ascii_case("closed") {
            "abandoned"
        } else if pr["draft"] == true {
            "draft"
        } else {
            "active"
        };
        let login = text(&pr["user"]["login"]);
        let title = text(&pr["title"]);
        let closed_at = if !pr["merged_at"].is_null() {
            pr["merged_at"].clone()
        } else {
            pr["closed_at"].clone()
        };
        return json!({
            "id": pr_id,
            "artifact": canonical_url,
            "provider": "github",
            "title": if title.is_empty() { format!("{full_repo} #{pr_id}") } else { title.to_owned() },
            "status": status,
            "repo": full_repo,
            "author": if login.is_empty() { Value::Null } else { json!({"id": login, "name": login}) },
            "created": pr["created_at"],
            "closed": closed_at,
            "source": text(&pr["head"]["ref"]),
            "target": text(&pr["base"]["ref"]),
            "url": canonical_url
        });
    }
    let fallback_title = fallback_comment
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("{full_repo} #{pr_id}"));
    json!({
        "id": pr_id,
        "artifact": canonical_url,
        "provider": "github",
        "title": fallback_title,
        "status": "active",
        "repo": full_repo,
        "author": Value::Null,
        "created": Value::Null,
        "closed": Value::Null,
        "source": "",
        "target": "main",
        "url": canonical_url
    })
}

pub fn map_pr(pr: &Value, org: &str, default_project: &str) -> Value {
    let repo = &pr["repository"];
    let project = repo["project"]["name"].as_str().unwrap_or(default_project);
    json!({
        "id":pr["pullRequestId"],
        "title":pr["title"],
        "status":if pr["isDraft"] == true && pr["status"] == "active" {
            json!("draft")
        } else {
            pr["status"].clone()
        },
        "repo":repo["name"],
        "author":person(&pr["createdBy"]),
        "created":pr["creationDate"],
        "closed":pr["closedDate"],
        "source":text(&pr["sourceRefName"]).trim_start_matches("refs/heads/"),
        "target":text(&pr["targetRefName"]).trim_start_matches("refs/heads/"),
        "url":format!(
            "{org}/{}/_git/{}/pullrequest/{}",
            enc(project),
            enc(text(&repo["name"])),
            pr["pullRequestId"]
        )
    })
}

pub fn sort_pull_requests(prs: &mut [Value]) {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_pr_numbers_and_encoded_urls() {
        assert_eq!(
            parse_pr_ref("!123", "SAN SA").unwrap(),
            PrRef::Ado {
                project: "SAN SA".into(),
                pr_id: 123
            }
        );
        assert_eq!(
            parse_pr_ref(
                "https://dev.azure.com/org/SAN%20SA/_git/repo/pullrequest/123",
                "other"
            )
            .unwrap(),
            PrRef::Ado {
                project: "SAN SA".into(),
                pr_id: 123
            }
        );
        assert_eq!(
            parse_pr_ref(
                "https://msft.ghe.com/san/bing-growth-sapphire-app/pull/588",
                "SAN SA"
            )
            .unwrap(),
            PrRef::GitHub {
                host: "msft.ghe.com".into(),
                owner: "san".into(),
                repo: "bing-growth-sapphire-app".into(),
                pr_id: 588,
                url: "https://msft.ghe.com/san/bing-growth-sapphire-app/pull/588".into()
            }
        );
        assert!(parse_pr_ref("javascript:alert(1)", "SAN SA").is_err());
        assert!(parse_pr_ref("0", "SAN SA").is_err());
    }
}
