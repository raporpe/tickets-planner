use crate::domain::error::{Error, Result};
use chrono::{DateTime, Local, NaiveDateTime, TimeZone, Utc};
use serde_json::Value;
#[cfg(not(windows))]
use std::path::Path;
use tokio::{process::Command, time::Duration};

pub const RESOURCE: &str = "499b84ac-1321-427f-aa17-267ca6975798";
pub const CLIENT_ID: &str = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";

pub struct Token {
    pub access: String,
    pub expires: i64,
    pub refresh: Option<String>,
}

pub fn parse_token(value: &Value, old_refresh: Option<String>) -> Result<Token> {
    let access = value["access_token"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::new(502, "Microsoft returned no access token"))?
        .to_owned();
    let seconds = value["expires_in"]
        .as_i64()
        .filter(|n| *n > 0)
        .ok_or_else(|| Error::new(502, "Microsoft returned an invalid token expiry"))?;
    Ok(Token {
        access,
        expires: Utc::now().timestamp() + seconds,
        refresh: value["refresh_token"]
            .as_str()
            .map(str::to_owned)
            .or(old_refresh),
    })
}

pub async fn cli_token() -> Result<Token> {
    #[cfg(windows)]
    let mut command = {
        let mut command = Command::new("cmd.exe");
        command.args([
            "/d",
            "/c",
            "az",
            "account",
            "get-access-token",
            "--resource",
            RESOURCE,
            "--output",
            "json",
        ]);
        command.creation_flags(0x08000000);
        command
    };
    #[cfg(not(windows))]
    let mut command = {
        let executable = ["/opt/homebrew/bin/az", "/usr/local/bin/az"]
            .into_iter()
            .find(|p| Path::new(p).is_file())
            .unwrap_or("az");
        let mut command = Command::new(executable);
        command.args([
            "account",
            "get-access-token",
            "--resource",
            RESOURCE,
            "--output",
            "json",
        ]);
        command
    };
    command.kill_on_drop(true);
    let output = tokio::time::timeout(Duration::from_secs(60), command.output())
        .await
        .map_err(|_| {
            Error::new(
                401,
                "Azure CLI sign-in timed out. Use device-code sign-in instead.",
            )
        })?
        .map_err(|_| {
            Error::new(
                401,
                "Azure CLI is not installed. Use device-code sign-in, or install Azure CLI and run az login.",
            )
        })?;
    if !output.status.success() {
        return Err(Error::new(
            401,
            format!(
                "Azure CLI sign-in failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ),
        ));
    }
    let value: Value = serde_json::from_slice(&output.stdout)?;
    let access = value["accessToken"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::new(401, "Azure CLI returned no token. Run az login."))?
        .to_owned();
    let expires = cli_expiry(&value)?;
    Ok(Token {
        access,
        expires,
        refresh: None,
    })
}

pub fn cli_expiry(value: &Value) -> Result<i64> {
    if let Some(seconds) = value["expires_on"]
        .as_i64()
        .or_else(|| value["expires_on"].as_str().and_then(|s| s.parse().ok()))
    {
        return Ok(seconds);
    }
    let expiry = value["expiresOn"]
        .as_str()
        .ok_or_else(|| Error::new(401, "Azure CLI returned no token expiry"))?;
    if let Ok(dt) = DateTime::parse_from_rfc3339(expiry) {
        return Ok(dt.timestamp());
    }
    let naive = NaiveDateTime::parse_from_str(expiry, "%Y-%m-%d %H:%M:%S%.f")
        .map_err(|_| Error::new(401, "Azure CLI returned an invalid token expiry"))?;
    Local
        .from_local_datetime(&naive)
        .earliest()
        .map(|d| d.timestamp())
        .ok_or_else(|| Error::new(401, "Azure CLI returned an ambiguous token expiry"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn cli_expiry_supports_both_cli_versions() {
        assert_eq!(
            cli_expiry(&json!({"expires_on":1700000000})).unwrap(),
            1700000000
        );
        assert_eq!(
            cli_expiry(&json!({"expires_on":"1700000000"})).unwrap(),
            1700000000
        );
        assert_eq!(
            cli_expiry(&json!({"expiresOn":"2023-11-14T22:13:20Z"})).unwrap(),
            1700000000
        );
        assert!(cli_expiry(&json!({})).is_err());
    }

    #[test]
    fn refresh_retains_old_refresh_token() {
        let token = parse_token(
            &json!({"access_token":"example","expires_in":3600}),
            Some("previous".into()),
        )
        .unwrap();
        assert_eq!(token.refresh.as_deref(), Some("previous"));
        assert!(parse_token(&json!({"expires_in":3600}), None).is_err());
    }
}
