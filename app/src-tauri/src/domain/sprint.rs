use crate::domain::work_item::{array, text};
use chrono::{DateTime, Duration, Utc};
use serde_json::{json, Value};
use std::collections::HashSet;

pub fn time_frame(start: &Value, finish: &Value) -> &'static str {
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

pub fn map_sprints(node: &Value, team: &Value, backlog_path: &str) -> Value {
    let subscribed: HashSet<&str> = array(&team["value"])
        .iter()
        .map(|t| text(&t["id"]))
        .collect();
    let mut sprints: Vec<Value> = array(&node["children"])
        .iter()
        .map(|c| {
            json!({
                "identifier":c["identifier"],
                "name":c["name"],
                "path":format!("{backlog_path}\\{}", text(&c["name"])),
                "start":c["attributes"]["startDate"],
                "finish":c["attributes"]["finishDate"],
                "subscribed":subscribed.contains(text(&c["identifier"])),
                "timeFrame":time_frame(&c["attributes"]["startDate"], &c["attributes"]["finishDate"])
            })
        })
        .collect();
    sprints.sort_by(|a, b| text(&a["start"]).cmp(text(&b["start"])));
    json!(sprints)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sprint_time_frame_handles_past_current_future_and_unscheduled() {
        assert_eq!(time_frame(&Value::Null, &Value::Null), "unscheduled");
        assert_eq!(
            time_frame(&json!("2020-01-01T00:00:00Z"), &json!("2020-01-07T00:00:00Z")),
            "past"
        );
        assert_eq!(
            time_frame(&json!("2099-01-01T00:00:00Z"), &json!("2099-01-07T00:00:00Z")),
            "future"
        );
        let start = (Utc::now() - Duration::days(1)).to_rfc3339();
        let finish = (Utc::now() + Duration::days(1)).to_rfc3339();
        assert_eq!(time_frame(&json!(start), &json!(finish)), "current");
    }
}
