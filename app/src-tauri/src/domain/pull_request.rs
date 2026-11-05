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

pub fn parse_pr_ref(input: &str, project: &str) -> Result<(String, u64)> {
    let bare = input.strip_prefix('!').unwrap_or(input);
    if let Ok(pr_id) = positive_id(bare) {
        return Ok((project.to_owned(), pr_id));
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
                    if let Some(pr_id) = segments.get(index + 3) {
                        return Ok((project, positive_id(pr_id)?));
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
}
