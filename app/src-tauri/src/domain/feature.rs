use crate::domain::work_item::{array, id, text};
use serde_json::{json, Value};
use std::collections::HashSet;

pub const COLUMN: &str = "WEF_9DB34C125FE94EC5BED3AB6B1B826B4C_Kanban.Column";
pub const LANE: &str = "WEF_9DB34C125FE94EC5BED3AB6B1B826B4C_Kanban.Lane";

pub const FEATURE_BATCH_FIELDS: [&str; 8] = [
    "System.Id",
    "System.Title",
    "System.State",
    "System.IterationPath",
    "System.AreaPath",
    "System.AssignedTo",
    COLUMN,
    LANE,
];

pub fn is_on_board(wi: &Value, board_set: &HashSet<u64>, project: &str, backlog: &str) -> bool {
    if board_set.contains(&id(wi)) {
        return true;
    }
    let f = &wi["fields"];
    if text(&f["System.State"]) == "Removed" {
        return false;
    }
    let area = text(&f["System.AreaPath"]);
    let iter = text(&f["System.IterationPath"]);
    let in_area = area == project
        || area
            .strip_prefix(project)
            .is_some_and(|rest| rest.starts_with('\\'));
    let in_iter = iter == backlog
        || iter
            .strip_prefix(backlog)
            .is_some_and(|rest| rest.starts_with('\\'));
    in_area && in_iter
}

pub fn resolve_column<'a>(f: &'a Value, columns: &'a Value) -> Option<&'a str> {
    let state = text(&f["System.State"]);
    let col_list = array(columns);
    let boundary_col = col_list
        .iter()
        .find(|c| {
            matches!(text(&c["type"]), "incoming" | "outgoing") && text(&c["state"]) == state
        })
        .and_then(|c| c["name"].as_str());
    let raw_col = f[COLUMN].as_str().filter(|s| !s.is_empty());
    let fallback_col = col_list
        .iter()
        .find(|c| text(&c["state"]) == state)
        .and_then(|c| c["name"].as_str());
    boundary_col.or(raw_col).or(fallback_col)
}

pub fn map_feature(wi: &Value, on_board: bool, columns: &Value, edit_url: &str) -> Value {
    let f = &wi["fields"];
    let column = resolve_column(f, columns);
    json!({
        "id":wi["id"],
        "title":f["System.Title"],
        "state":f["System.State"],
        "column":column,
        "lane":f[LANE],
        "iterationPath":f["System.IterationPath"],
        "areaPath":f["System.AreaPath"],
        "owner":f["System.AssignedTo"]["displayName"],
        "onBoard":on_board,
        "url":edit_url
    })
}

pub fn map_feature_columns(columns: &Value) -> Value {
    json!(array(&columns["value"])
        .iter()
        .map(|c| json!({
            "name":c["name"],
            "state":c["stateMappings"]["Feature"],
            "type":c["columnType"]
        }))
        .collect::<Vec<_>>())
}
