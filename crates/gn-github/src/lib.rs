use base64::Engine;
use gn_core::DocumentFormat;
use keyring::Entry;
use reqwest::Client;
use reqwest::header::{ACCEPT, AUTHORIZATION, HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use thiserror::Error;
use tokio::time::{Duration, Instant, sleep};
use tracing::{debug, warn};

const GITHUB_API_BASE: &str = "https://api.github.com";
const API_VERSION: &str = "2022-11-28";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const DEVICE_GRANT_TYPE: &str = "urn:ietf:params:oauth:grant-type:device_code";
const TOKEN_SERVICE: &str = "gitnotes";
const TOKEN_ACCOUNT: &str = "github-token";

#[derive(Debug, Error)]
pub enum GitHubClientError {
    #[error("token cannot be empty")]
    EmptyToken,
    #[error("failed to build http headers: {0}")]
    InvalidHeader(#[from] reqwest::header::InvalidHeaderValue),
    #[error("request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    #[error("response decode failed: {0}")]
    DecodeFailed(#[from] base64::DecodeError),
    #[error("file content is not utf-8")]
    NonUtf8Content,
    #[error("github file update conflict (409): remote file changed")]
    Conflict,
    #[error("github api error status {status}: {message}")]
    ApiStatus { status: u16, message: String },
    #[error("request cannot be cloned for retry")]
    NonCloneableRequest,
}

pub type GitHubResult<T> = Result<T, GitHubClientError>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Conditional<T> {
    NotModified,
    Modified(T),
}

#[derive(Debug, Error)]
pub enum DeviceFlowError {
    #[error("client id cannot be empty")]
    EmptyClientId,
    #[error("request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    #[error("device code expired")]
    ExpiredToken,
    #[error("authorization denied by user")]
    AccessDenied,
    #[error("authentication timed out")]
    Timeout,
    #[error("oauth error: {code} - {description}")]
    OAuth { code: String, description: String },
}

#[derive(Debug, Error)]
pub enum TokenStorageError {
    #[error("secure keyring operation failed: {0}")]
    Keyring(#[from] keyring::Error),
}

#[derive(Clone, Debug)]
pub struct GitHubClient {
    token: String,
    http: Client,
    rate_limit: Arc<Mutex<Option<RateLimitInfo>>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitInfo {
    pub remaining: u32,
    pub reset_epoch: Option<u64>,
}

#[derive(Clone, Debug)]
pub struct GitHubOAuthDeviceClient {
    client_id: String,
    http: Client,
}

pub fn store_token_secure(token: &str) -> Result<(), TokenStorageError> {
    let entry = Entry::new(TOKEN_SERVICE, TOKEN_ACCOUNT)?;
    entry.set_password(token)?;
    Ok(())
}

pub fn load_token_secure() -> Result<Option<String>, TokenStorageError> {
    let entry = Entry::new(TOKEN_SERVICE, TOKEN_ACCOUNT)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(TokenStorageError::Keyring(err)),
    }
}

pub fn clear_token_secure() -> Result<(), TokenStorageError> {
    let entry = Entry::new(TOKEN_SERVICE, TOKEN_ACCOUNT)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(TokenStorageError::Keyring(err)),
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct GitHubRepository {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub default_branch: String,
    pub pushed_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct GitTreeResponse {
    pub sha: String,
    pub truncated: bool,
    pub tree: Vec<GitTreeEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct GitTreeEntry {
    pub path: String,
    pub mode: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub sha: String,
    pub size: Option<u64>,
    pub url: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NoteBlob {
    pub path: String,
    pub size: Option<u64>,
    pub format: DocumentFormat,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct UserProfile {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct AccessTokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub scope: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FileContent {
    pub sha: String,
    pub path: String,
    pub content: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct CommitAuthor {
    pub name: String,
    pub email: String,
}

#[derive(Clone, Debug)]
pub struct UpsertFileInput<'a> {
    pub owner: &'a str,
    pub repo: &'a str,
    pub path: &'a str,
    pub message: &'a str,
    pub content: &'a str,
    pub sha: Option<&'a str>,
    pub branch: Option<&'a str>,
    pub committer: Option<CommitAuthor>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpsertFileResponse {
    pub content: UpsertedContent,
    pub commit: UpsertedCommit,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpsertedContent {
    pub name: String,
    pub path: String,
    pub sha: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpsertedCommit {
    pub sha: String,
    pub html_url: String,
}

#[derive(Debug, Deserialize)]
struct ContentsResponse {
    pub sha: String,
    pub path: String,
    pub encoding: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DevicePollResponse {
    access_token: Option<String>,
    token_type: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Serialize)]
struct UpsertFileRequest<'a> {
    pub message: &'a str,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committer: Option<CommitAuthor>,
}

impl GitHubClient {
    pub fn new(token: impl Into<String>) -> GitHubResult<Self> {
        let token = token.into();
        if token.trim().is_empty() {
            return Err(GitHubClientError::EmptyToken);
        }

        let headers = Self::build_headers(&token)?;
        let http = Client::builder().default_headers(headers).build()?;

        Ok(Self { token, http, rate_limit: Arc::new(Mutex::new(None)) })
    }

    pub fn token_len(&self) -> usize {
        self.token.len()
    }

    pub fn last_rate_limit_info(&self) -> Option<RateLimitInfo> {
        self.rate_limit.lock().ok().and_then(|guard| guard.clone())
    }

    fn build_headers(token: &str) -> GitHubResult<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));
        headers.insert(USER_AGENT, HeaderValue::from_static("gitnotes/0.1"));
        headers.insert("X-GitHub-Api-Version", HeaderValue::from_str(API_VERSION)?);
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {token}"))?);
        Ok(headers)
    }

    pub async fn user_profile(&self) -> GitHubResult<UserProfile> {
        let url = format!("{GITHUB_API_BASE}/user");
        let response = self.send_with_retry(self.http.get(url), "GET /user").await?;
        let profile = response.error_for_status()?.json::<UserProfile>().await?;

        Ok(profile)
    }

    pub async fn list_user_repositories(
        &self,
        page: u32,
        per_page: u32,
    ) -> GitHubResult<Vec<GitHubRepository>> {
        match self.list_user_repositories_with_etag(page, per_page, None).await? {
            Conditional::Modified(repos) => Ok(repos),
            Conditional::NotModified => Ok(Vec::new()),
        }
    }

    pub async fn list_user_repositories_with_etag(
        &self,
        page: u32,
        per_page: u32,
        etag: Option<&str>,
    ) -> GitHubResult<Conditional<Vec<GitHubRepository>>> {
        let url = format!("{GITHUB_API_BASE}/user/repos");
        let mut request = self.http.get(url).query(&[
            ("type", "all"),
            ("sort", "updated"),
            ("direction", "desc"),
            ("page", &page.to_string()),
            ("per_page", &per_page.to_string()),
        ]);

        if let Some(value) = etag {
            request = request.header("If-None-Match", value);
        }

        let response = self.send_with_retry(request, "GET /user/repos").await?;
        if response.status() == reqwest::StatusCode::NOT_MODIFIED {
            return Ok(Conditional::NotModified);
        }

        let repos = response.error_for_status()?.json::<Vec<GitHubRepository>>().await?;

        Ok(Conditional::Modified(repos))
    }

    pub async fn list_all_user_repositories(&self) -> GitHubResult<Vec<GitHubRepository>> {
        let mut page = 1;
        let mut all = Vec::new();

        loop {
            let chunk = self.list_user_repositories(page, 100).await?;
            if chunk.is_empty() {
                break;
            }

            let chunk_len = chunk.len();
            all.extend(chunk);
            if chunk_len < 100 {
                break;
            }
            page += 1;
        }

        Ok(all)
    }

    pub async fn repository_tree(
        &self,
        owner: &str,
        repo: &str,
        git_ref: &str,
    ) -> GitHubResult<GitTreeResponse> {
        let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{git_ref}");
        let request = self.http.get(url).query(&[("recursive", "1")]);
        let response =
            self.send_with_retry(request, "GET /repos/:owner/:repo/git/trees/:ref").await?;
        let tree = response.error_for_status()?.json::<GitTreeResponse>().await?;

        Ok(tree)
    }

    pub fn filter_supported_note_files<'a>(
        paths: impl IntoIterator<Item = &'a str>,
    ) -> Vec<&'a str> {
        paths.into_iter().filter(|path| DocumentFormat::from_path(path).is_some()).collect()
    }

    pub fn filter_note_blob_paths(entries: &[GitTreeEntry]) -> Vec<String> {
        entries
            .iter()
            .filter(|entry| entry.kind == "blob")
            .map(|entry| entry.path.as_str())
            .filter(|path| DocumentFormat::from_path(path).is_some())
            .map(ToOwned::to_owned)
            .collect()
    }

    pub fn filter_note_blobs(entries: &[GitTreeEntry]) -> Vec<NoteBlob> {
        entries
            .iter()
            .filter(|entry| entry.kind == "blob")
            .filter_map(|entry| {
                DocumentFormat::from_path(entry.path.as_str()).map(|format| NoteBlob {
                    path: entry.path.clone(),
                    size: entry.size,
                    format,
                })
            })
            .collect()
    }

    pub async fn file_content(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        git_ref: &str,
    ) -> GitHubResult<FileContent> {
        let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}");
        let request = self.http.get(url).query(&[("ref", git_ref)]);
        let response =
            self.send_with_retry(request, "GET /repos/:owner/:repo/contents/:path").await?;
        let response = response.error_for_status()?.json::<ContentsResponse>().await?;

        let raw =
            decode_content_payload(response.encoding.as_deref(), response.content.as_deref())?;
        let content = String::from_utf8(raw).map_err(|_| GitHubClientError::NonUtf8Content)?;

        Ok(FileContent { sha: response.sha, path: response.path, content })
    }

    pub async fn upsert_file(
        &self,
        input: UpsertFileInput<'_>,
    ) -> GitHubResult<UpsertFileResponse> {
        let url = format!(
            "{GITHUB_API_BASE}/repos/{}/{}/contents/{}",
            input.owner, input.repo, input.path
        );
        let payload = UpsertFileRequest {
            message: input.message,
            content: base64::engine::general_purpose::STANDARD.encode(input.content.as_bytes()),
            sha: input.sha,
            branch: input.branch,
            committer: input.committer,
        };

        let response = self
            .send_with_retry(
                self.http.put(url).json(&payload),
                "PUT /repos/:owner/:repo/contents/:path",
            )
            .await?;

        let status = response.status();
        if status == reqwest::StatusCode::CONFLICT {
            return Err(GitHubClientError::Conflict);
        }

        if !status.is_success() {
            let message = response.text().await.unwrap_or_default();
            return Err(GitHubClientError::ApiStatus { status: status.as_u16(), message });
        }

        let response = response.json::<UpsertFileResponse>().await?;

        Ok(response)
    }

    async fn send_with_retry(
        &self,
        request: reqwest::RequestBuilder,
        operation: &str,
    ) -> GitHubResult<reqwest::Response> {
        let mut attempt = 0_u8;
        let mut backoff = Duration::from_millis(250);

        loop {
            attempt += 1;
            let Some(next) = request.try_clone() else {
                return Err(GitHubClientError::NonCloneableRequest);
            };

            debug!(operation, attempt, "sending github api request");
            let response = next.send().await?;
            let status = response.status();
            self.handle_rate_limit_headers(&response, operation).await;

            if status == reqwest::StatusCode::UNAUTHORIZED
                || status == reqwest::StatusCode::FORBIDDEN
                || status == reqwest::StatusCode::NOT_FOUND
                || status == reqwest::StatusCode::UNPROCESSABLE_ENTITY
                || status == reqwest::StatusCode::CONFLICT
                || status == reqwest::StatusCode::NOT_MODIFIED
                || status.is_success()
            {
                return Ok(response);
            }

            if (status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS)
                && attempt < 4
            {
                warn!(operation, attempt, ?status, "retrying github api request with backoff");
                sleep(backoff).await;
                backoff *= 2;
                continue;
            }

            let message = response.text().await.unwrap_or_default();
            return Err(GitHubClientError::ApiStatus { status: status.as_u16(), message });
        }
    }

    async fn handle_rate_limit_headers(&self, response: &reqwest::Response, operation: &str) {
        let remaining = response
            .headers()
            .get("x-ratelimit-remaining")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u32>().ok());

        let reset = response
            .headers()
            .get("x-ratelimit-reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok());

        if let Some(remaining_value) = remaining
            && let Ok(mut guard) = self.rate_limit.lock()
        {
            *guard = Some(RateLimitInfo { remaining: remaining_value, reset_epoch: reset });
        }

        if matches!(remaining, Some(0)) {
            warn!(operation, "github primary rate limit reached");
            if let Some(reset_epoch) = reset {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                if reset_epoch > now {
                    let wait_secs = (reset_epoch - now).min(3);
                    sleep(Duration::from_secs(wait_secs)).await;
                }
            }
        }
    }
}

impl GitHubOAuthDeviceClient {
    pub fn new(client_id: impl Into<String>) -> Result<Self, DeviceFlowError> {
        let client_id = client_id.into();
        if client_id.trim().is_empty() {
            return Err(DeviceFlowError::EmptyClientId);
        }

        let http = Client::builder().build()?;
        Ok(Self { client_id, http })
    }

    pub async fn request_device_code(
        &self,
        scope: &str,
    ) -> Result<DeviceCodeResponse, DeviceFlowError> {
        let response = self
            .http
            .post(DEVICE_CODE_URL)
            .header(ACCEPT, "application/json")
            .form(&[("client_id", self.client_id.as_str()), ("scope", scope)])
            .send()
            .await?
            .error_for_status()?
            .json::<DeviceCodeResponse>()
            .await?;

        Ok(response)
    }

    pub async fn poll_access_token(
        &self,
        device_code: &str,
        interval_seconds: u64,
        expires_in_seconds: u64,
    ) -> Result<AccessTokenResponse, DeviceFlowError> {
        let mut interval = Duration::from_secs(interval_seconds.max(1));
        let deadline = Instant::now() + Duration::from_secs(expires_in_seconds.saturating_sub(1));

        loop {
            if Instant::now() >= deadline {
                return Err(DeviceFlowError::Timeout);
            }

            sleep(interval).await;
            let poll_response = self
                .http
                .post(ACCESS_TOKEN_URL)
                .header(ACCEPT, "application/json")
                .form(&[
                    ("client_id", self.client_id.as_str()),
                    ("device_code", device_code),
                    ("grant_type", DEVICE_GRANT_TYPE),
                ])
                .send()
                .await?
                .error_for_status()?
                .json::<DevicePollResponse>()
                .await?;

            match poll_response.error.as_deref() {
                None => {
                    return Ok(AccessTokenResponse {
                        access_token: poll_response.access_token.unwrap_or_default(),
                        token_type: poll_response.token_type.unwrap_or_else(|| "bearer".to_owned()),
                        scope: poll_response.scope.unwrap_or_default(),
                    });
                }
                Some("authorization_pending") => {}
                Some("slow_down") => interval += Duration::from_secs(5),
                Some("expired_token") => return Err(DeviceFlowError::ExpiredToken),
                Some("access_denied") => return Err(DeviceFlowError::AccessDenied),
                Some(code) => {
                    return Err(DeviceFlowError::OAuth {
                        code: code.to_owned(),
                        description: poll_response.error_description.unwrap_or_default(),
                    });
                }
            }
        }
    }
}

fn decode_content_payload(
    encoding: Option<&str>,
    content: Option<&str>,
) -> Result<Vec<u8>, GitHubClientError> {
    let normalized = content.unwrap_or_default().replace('\n', "");
    if encoding == Some("base64") {
        let bytes = base64::engine::general_purpose::STANDARD.decode(normalized.as_bytes())?;
        return Ok(bytes);
    }

    Ok(normalized.into_bytes())
}

#[cfg(test)]
mod tests {
    use crate::{
        DeviceFlowError, DevicePollResponse, GitHubClient, GitHubOAuthDeviceClient, GitTreeEntry,
        decode_content_payload,
    };

    #[test]
    fn filters_supported_extensions() {
        let files = ["a.md", "b.org", "c.norg", "d.txt"];
        let filtered = GitHubClient::filter_supported_note_files(files);
        assert_eq!(filtered, vec!["a.md", "b.org", "c.norg"]);
    }

    #[test]
    fn filters_blob_note_paths_from_tree_entries() {
        let entries = vec![
            GitTreeEntry {
                path: "notes/day1.md".to_owned(),
                mode: "100644".to_owned(),
                kind: "blob".to_owned(),
                sha: "1".to_owned(),
                size: Some(10),
                url: "u1".to_owned(),
            },
            GitTreeEntry {
                path: "notes/day2.org".to_owned(),
                mode: "100644".to_owned(),
                kind: "blob".to_owned(),
                sha: "2".to_owned(),
                size: Some(10),
                url: "u2".to_owned(),
            },
            GitTreeEntry {
                path: "notes/dir".to_owned(),
                mode: "040000".to_owned(),
                kind: "tree".to_owned(),
                sha: "3".to_owned(),
                size: None,
                url: "u3".to_owned(),
            },
        ];

        let filtered = GitHubClient::filter_note_blob_paths(&entries);
        assert_eq!(filtered, vec!["notes/day1.md", "notes/day2.org"]);
    }

    #[test]
    fn filters_note_blobs_with_format_and_size() {
        let entries = vec![
            GitTreeEntry {
                path: "notes/day1.md".to_owned(),
                mode: "100644".to_owned(),
                kind: "blob".to_owned(),
                sha: "1".to_owned(),
                size: Some(123),
                url: "u1".to_owned(),
            },
            GitTreeEntry {
                path: "assets/logo.png".to_owned(),
                mode: "100644".to_owned(),
                kind: "blob".to_owned(),
                sha: "2".to_owned(),
                size: Some(999),
                url: "u2".to_owned(),
            },
        ];

        let filtered = GitHubClient::filter_note_blobs(&entries);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].path, "notes/day1.md");
        assert_eq!(filtered[0].size, Some(123));
    }

    #[test]
    fn decodes_base64_content_with_newlines() {
        let decoded = decode_content_payload(Some("base64"), Some("SGVsbG8sIFdvcmxkIQ==\n"))
            .expect("must decode");

        assert_eq!(decoded, b"Hello, World!");
    }

    #[test]
    fn oauth_device_client_rejects_empty_client_id() {
        let result = GitHubOAuthDeviceClient::new(" ");
        assert!(matches!(result, Err(DeviceFlowError::EmptyClientId)));
    }

    #[test]
    fn parses_oauth_poll_error_shape() {
        let payload = r#"{"error":"slow_down","error_description":"slow down"}"#;
        let parsed: DevicePollResponse =
            serde_json::from_str(payload).expect("device poll error should parse");

        assert_eq!(parsed.error.as_deref(), Some("slow_down"));
        assert_eq!(parsed.error_description.as_deref(), Some("slow down"));
    }
}
