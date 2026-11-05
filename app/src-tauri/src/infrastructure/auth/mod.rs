pub mod cli;

use crate::domain::error::{Error, Result};
use chrono::Utc;
use cli::{cli_token, parse_token, Token, CLIENT_ID, RESOURCE};
use serde_json::{json, Value};
use std::{env, sync::Arc};
use tokio::{
    sync::Mutex,
    time::{sleep, Duration},
};

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
