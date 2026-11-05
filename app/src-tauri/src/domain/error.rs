use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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

pub fn positive_id(value: &str) -> Result<u64> {
    value
        .parse::<u64>()
        .ok()
        .filter(|v| *v > 0)
        .ok_or_else(|| Error::new(400, "Invalid work item ID"))
}

pub fn required<'a>(body: &'a Value, key: &str) -> Result<&'a str> {
    body[key]
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::new(400, format!("{key} is empty")))
}

pub fn enc(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn invalid_input_is_an_explicit_error() {
        assert!(positive_id("../1").is_err());
        assert!(positive_id("0").is_err());
        assert_eq!(positive_id("42").unwrap(), 42);
        assert!(required(&json!({"text":"  "}), "text").is_err());
        assert_eq!(required(&json!({"text":" hello "}), "text").unwrap(), "hello");
        assert_eq!(enc("SAN SA"), "SAN%20SA");
    }
}
