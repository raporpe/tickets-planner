use crate::domain::error::{Error, Result};
use serde_json::{json, Value};
use std::collections::HashSet;

pub const TYPES: [&str; 3] = ["Task", "Bug", "User Story"];
pub const STANDUP_USERS: [&str; 12] = [
    "pboyanoivars@microsoft.com",
    "raulpo@microsoft.com",
    "soranalatas@microsoft.com",
    "amarchesin@microsoft.com",
    "marchesin.angelo@microsoft.com",
    "gfornonssera@microsoft.com",
    "nlattuada@microsoft.com",
    "gemarques@microsoft.com",
    "masaucaortiz@microsoft.com",
    "tianpli@microsoft.com",
    "clairewang@microsoft.com",
    "jiaruigui@microsoft.com",
];
pub const RICH: [&str; 3] = [
    "System.Description",
    "Microsoft.VSTS.TCM.ReproSteps",
    "Microsoft.VSTS.Common.AcceptanceCriteria",
];
pub const COMMENTS_API: &str = "7.1-preview.4";

pub fn text(value: &Value) -> &str {
    value.as_str().unwrap_or("")
}

pub fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}

pub fn id(wi: &Value) -> u64 {
    wi["id"].as_u64().unwrap_or(0)
}

pub fn parent(wi: &Value) -> Option<u64> {
    array(&wi["relations"])
        .iter()
        .find(|r| r["rel"] == "System.LinkTypes.Hierarchy-Reverse")
        .and_then(|r| text(&r["url"]).rsplit('/').next()?.parse().ok())
}

pub fn children(wi: &Value) -> Vec<u64> {
    array(&wi["relations"])
        .iter()
        .filter(|r| r["rel"] == "System.LinkTypes.Hierarchy-Forward")
        .filter_map(|r| text(&r["url"]).rsplit('/').next()?.parse().ok())
        .collect()
}

pub fn tags(fields: &Value) -> Vec<&str> {
    text(&fields["System.Tags"])
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn normalize_tags(tag_list: &[Value]) -> Vec<String> {
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
    cleaned
}

pub fn weeks_carried(tag_list: &[&str]) -> usize {
    tag_list
        .iter()
        .filter(|t| t.len() == 8 && t.bytes().all(|b| b.is_ascii_digit()))
        .count()
}

pub fn is_sprintable(work_item_type: &str) -> bool {
    matches!(work_item_type, "Task" | "Bug")
}

pub fn validate_priority(priority: u64) -> Result<u64> {
    if (0..=4).contains(&priority) {
        Ok(priority)
    } else {
        Err(Error::new(400, "Priority must be between 0 and 4"))
    }
}

pub fn done(state: &Value) -> bool {
    matches!(
        text(state),
        "Closed" | "Done" | "Removed" | "Resolved" | "Shipped"
    )
}

pub fn is_closed_or_removed(state: &Value) -> bool {
    matches!(text(state), "Closed" | "Removed" | "Done")
}

pub fn person(value: &Value) -> Value {
    if value.is_null() {
        Value::Null
    } else {
        json!({
            "id":value["id"],
            "name":value["displayName"],
            "email":value["uniqueName"],
            "imageUrl":value["imageUrl"]
        })
    }
}

pub fn comment(value: &Value) -> Value {
    json!({
        "id":value["id"],"text":text(&value["text"]),
        "format":value["format"].as_str().unwrap_or("html").to_lowercase(),
        "version":value["version"],"createdBy":person(&value["createdBy"]),
        "createdDate":value["createdDate"],"modifiedDate":value["modifiedDate"]
    })
}

pub fn summary(wi: &Value, edit_url: &str) -> Value {
    let f = &wi["fields"];
    json!({
        "id":wi["id"],
        "title":f["System.Title"],
        "type":f["System.WorkItemType"],
        "state":f["System.State"],
        "iterationPath":f["System.IterationPath"],
        "url":edit_url
    })
}

pub fn add(ops: &mut Vec<Value>, path: impl Into<String>, value: impl Into<Value>) {
    ops.push(json!({"op":"add","path":path.into(),"value":value.into()}));
}

pub fn test_revision(ops: &mut Vec<Value>, rev: &Value) {
    if !rev.is_null() {
        ops.push(json!({"op":"test","path":"/rev","value":rev}));
    }
}

pub fn overview_query(sprints: &Value) -> String {
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
    format!(
        "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] = @Me AND [System.WorkItemType] IN ({}) AND ([System.State] NOT IN ('Closed','Removed','Done') OR ([System.State] = 'Closed' AND [System.ChangedDate] >= @Today - 21){keep})",
        TYPES
            .iter()
            .map(|t| format!("'{t}'"))
            .collect::<Vec<_>>()
            .join(",")
    )
}

pub fn standup_query(users: &[String], sprint_path: &str) -> String {
    let emails: Vec<String> = users
        .iter()
        .map(|u| u.trim())
        .filter(|u| !u.is_empty())
        .map(|u| format!("'{}'", u.replace('\'', "''")))
        .collect();
    let types = TYPES
        .iter()
        .map(|t| format!("'{t}'"))
        .collect::<Vec<_>>()
        .join(",");
    let safe_sprint = sprint_path.replace('\'', "''");
    format!(
        "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.AssignedTo] IN ({}) AND [System.WorkItemType] IN ({types}) AND [System.State] <> 'Removed' AND [System.IterationPath] = '{safe_sprint}'",
        emails.join(",")
    )
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn hierarchy_and_comment_shapes_match_the_browser_api() {
        let wi = json!({"id":10,"relations":[
            {"rel":"System.LinkTypes.Hierarchy-Reverse","url":"https://example/1"},
            {"rel":"System.LinkTypes.Hierarchy-Forward","url":"https://example/20"}
        ]});
        assert_eq!(parent(&wi), Some(1));
        assert_eq!(children(&wi), vec![20]);
        let c = comment(&json!({
            "id":1,
            "text":"hello",
            "format":"Markdown",
            "createdBy":{"id":"a","displayName":"Person","uniqueName":"p@example.com"}
        }));
        assert_eq!(c["format"], "markdown");
        assert_eq!(c["createdBy"]["name"], "Person");
        assert_eq!(c["createdBy"]["email"], "p@example.com");
    }

    #[test]
    fn priority_validation_accepts_p0_to_p4_and_rejects_out_of_range() {
        for p in 0..=4 {
            assert_eq!(validate_priority(p).unwrap(), p);
        }
        let err = validate_priority(5).unwrap_err();
        assert_eq!(err.status, 400);
        assert!(err.error.contains("between 0 and 4"));
    }

    #[test]
    fn tag_normalization_deduplicates_case_insensitively_and_counts_weeks_carried() {
        let cleaned = normalize_tags(&[
            json!("FY26 C5; Backend"),
            json!("backend"),
            json!("20260101 ; 20260108 ; Sprint-Unplanned"),
        ]);
        assert_eq!(
            cleaned,
            vec!["FY26 C5", "Backend", "20260101", "20260108", "Sprint-Unplanned"]
        );
        let refs: Vec<&str> = cleaned.iter().map(String::as_str).collect();
        assert_eq!(weeks_carried(&refs), 2);
        assert!(is_sprintable("Task"));
        assert!(is_sprintable("Bug"));
        assert!(!is_sprintable("User Story"));
        assert!(!is_sprintable("Feature"));
    }
}
