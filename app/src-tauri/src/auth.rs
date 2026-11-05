use crate::backend::{Error, Result};
use chrono::{DateTime, Local, NaiveDateTime, TimeZone, Utc};
use serde_json::{json, Value};
#[cfg(not(windows))]
use std::path::Path;
use std::{env, sync::Arc};
use tokio::{
    process::Command,
    sync::Mutex,
    time::{sleep, Duration},
};

const RESOURCE: &str = "499b84ac-1321-427f-aa17-267ca6975798";
const CLIENT_ID: &str = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";

struct Token {
    access: String,
    expires: i64,
    refresh: Option<String>,
}

struct Session {
    token: Option<Token>,
    method: &'static str,
    device: Value,
    generation: u64,
}

pub struct Auth {
    client: reqwest::Client,
    tenant: String,
    session: Mutex<Session>,
}

impl Auth {
    #[cfg(test)]
    pub fn for_test(client: reqwest::Client) -> Self {
        Self {
            client,
            tenant: "organizations".into(),
            session: Mutex::new(Session {
                token: Some(Token {
                    access: "synthetic-test-token".into(),
                    expires: Utc::now().timestamp() + 3600,
                    refresh: None,
                }),
                method: "azure-cli",
                device: json!({"status":"idle"}),
                generation: 0,
            }),
        }
    }

    pub fn new(client: reqwest::Client) -> Result<Self> {
        let tenant = env::var("AZURE_TENANT_ID").unwrap_or_else(|_| "organizations".into());
        if tenant.is_empty()
            || !tenant
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        {
            return Err(Error::new(
                400,
                "AZURE_TENANT_ID must be a tenant ID or domain",
            ));
        }
        Ok(Self {
            client,
            tenant,
            session: Mutex::new(Session {
                token: None,
                method: "azure-cli",
                device: json!({"status":"idle"}),
                generation: 0,
            }),
        })
    }

    fn endpoint(&self, name: &str) -> String {
        format!(
            "https://login.microsoftonline.com/{}/oauth2/v2.0/{name}",
            self.tenant
        )
    }

    async fn oauth(&self, endpoint: &str, form: &[(&str, &str)]) -> Result<Value> {
        let response = self
            .client
            .post(self.endpoint(endpoint))
            .form(form)
            .send()
            .await?;
        let status = response.status().as_u16();
        let value: Value = response.json().await?;
        if status >= 400 {
            return Err(Error::new(
                status,
                value["error_description"]
                    .as_str()
                    .unwrap_or("Microsoft sign-in failed"),
            )
            .with_code(value["error"].as_str().unwrap_or("oauth_error")));
        }
        Ok(value)
    }

    pub async fn method(&self) -> &'static str {
        self.session.lock().await.method
    }

    pub async fn invalidate(&self) {
        if let Some(token) = &mut self.session.lock().await.token {
            token.expires = 0;
        }
    }

    pub async fn token(&self) -> Result<String> {
        let mut session = self.session.lock().await;
        if let Some(t) = &session.token {
            if t.expires > Utc::now().timestamp() + 300 {
                return Ok(t.access.clone());
            }
        }
        let token = if session.method == "device-code" {
            let refresh = session
                .token
                .as_ref()
                .and_then(|t| t.refresh.as_deref())
                .ok_or_else(|| Error::new(401, "Sign in with a device code again"))?;
            let response = self
                .oauth(
                    "token",
                    &[
                        ("client_id", CLIENT_ID),
                        ("grant_type", "refresh_token"),
                        ("refresh_token", refresh),
                        ("scope", &format!("{RESOURCE}/.default offline_access")),
                    ],
                )
                .await?;
            parse_token(&response, Some(refresh.to_owned()))?
        } else {
            cli_token().await?
        };
        let access = token.access.clone();
        session.token = Some(token);
        Ok(access)
    }

    pub async fn sign_in_cli(&self) -> Result<Value> {
        {
            let mut session = self.session.lock().await;
            session.generation += 1;
            session.method = "azure-cli";
            session.token = None;
            session.device = json!({"status":"idle"});
        }
        self.token().await?;
        Ok(json!({"ok":true}))
    }

    pub async fn poll_device(&self) -> Value {
        self.session.lock().await.device.clone()
    }

    pub async fn start_device(self: &Arc<Self>) -> Result<Value> {
        let generation = {
            let mut session = self.session.lock().await;
            session.generation += 1;
            session.device = json!({"status":"pending"});
            session.generation
        };
        let response = self
            .oauth(
                "devicecode",
                &[
                    ("client_id", CLIENT_ID),
                    ("scope", &format!("{RESOURCE}/.default offline_access")),
                ],
            )
            .await?;
        let code = response["device_code"]
            .as_str()
            .ok_or_else(|| Error::new(502, "Microsoft returned no device code"))?
            .to_owned();
        let state = json!({
            "status":"pending", "userCode":response["user_code"],
            "verificationUri":response["verification_uri"], "message":response["message"], "error":null
        });
        let expires = response["expires_in"]
            .as_u64()
            .ok_or_else(|| Error::new(502, "Microsoft returned no device-code expiry"))?;
        let interval = response["interval"].as_u64().unwrap_or(5).max(1);
        {
            let mut session = self.session.lock().await;
            if session.generation != generation {
                return Err(Error::new(
                    409,
                    "This sign-in was replaced by a newer attempt",
                ));
            }
            session.device = state.clone();
        }
        let auth = self.clone();
        tauri::async_runtime::spawn(async move {
            let result = auth
                .finish_device(&code, generation, interval, expires)
                .await;
            let mut session = auth.session.lock().await;
            if session.generation != generation {
                return;
            }
            match result {
                Ok(token) => {
                    session.token = Some(token);
                    session.method = "device-code";
                    session.device["status"] = json!("done");
                }
                Err(error) => {
                    session.device["status"] = json!("error");
                    session.device["error"] = json!(error.error);
                }
            }
        });
        Ok(state)
    }

    async fn finish_device(
        &self,
        code: &str,
        generation: u64,
        mut interval: u64,
        expires: u64,
    ) -> Result<Token> {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(expires);
        while tokio::time::Instant::now() < deadline {
            sleep(Duration::from_secs(interval)).await;
            if self.session.lock().await.generation != generation {
                return Err(Error::new(409, "Sign-in cancelled"));
            }
            match self
                .oauth(
                    "token",
                    &[
                        ("client_id", CLIENT_ID),
                        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                        ("device_code", code),
                    ],
                )
                .await
            {
                Ok(response) => return parse_token(&response, None),
                Err(error) if error.code.as_deref() == Some("authorization_pending") => {}
                Err(error) if error.code.as_deref() == Some("slow_down") => interval += 5,
                Err(error) => return Err(error),
            }
        }
        Err(Error::new(
            401,
            "The device code expired. Start sign-in again.",
        ))
    }
}

fn parse_token(value: &Value, old_refresh: Option<String>) -> Result<Token> {
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

async fn cli_token() -> Result<Token> {
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
    let output = tokio::time::timeout(Duration::from_secs(60), command.output()).await
        .map_err(|_| Error::new(401, "Azure CLI sign-in timed out. Use device-code sign-in instead."))?
        .map_err(|_| Error::new(401, "Azure CLI is not installed. Use device-code sign-in, or install Azure CLI and run az login."))?;
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

fn cli_expiry(value: &Value) -> Result<i64> {
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
