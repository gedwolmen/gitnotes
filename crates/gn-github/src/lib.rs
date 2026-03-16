use base64::Engine;
use gn_core::DocumentFormat;
use reqwest::Client;
use reqwest::header::{ACCEPT, AUTHORIZATION, HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const GITHUB_API_BASE: &str = "https://api.github.com";
const API_VERSION: &str = "2022-11-28";

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
}

#[derive(Clone, Debug)]
pub struct GitHubClient {
    token: String,
    http: Client,
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

#[derive(Clone, Debug, Deserialize, Serialize, Eq, PartialEq)]
pub struct UserProfile {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
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
    pub fn new(token: impl Into<String>) -> Result<Self, GitHubClientError> {
        let token = token.into();
        if token.trim().is_empty() {
            return Err(GitHubClientError::EmptyToken);
        }

        let headers = Self::build_headers(&token)?;
        let http = Client::builder().default_headers(headers).build()?;

        Ok(Self { token, http })
    }

    pub fn token_len(&self) -> usize {
        self.token.len()
    }

    fn build_headers(token: &str) -> Result<HeaderMap, GitHubClientError> {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github+json"));
        headers.insert(USER_AGENT, HeaderValue::from_static("gitnotes/0.1"));
        headers.insert("X-GitHub-Api-Version", HeaderValue::from_str(API_VERSION)?);
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {token}"))?);
        Ok(headers)
    }

    pub async fn user_profile(&self) -> Result<UserProfile, GitHubClientError> {
        let url = format!("{GITHUB_API_BASE}/user");
        let profile =
            self.http.get(url).send().await?.error_for_status()?.json::<UserProfile>().await?;

        Ok(profile)
    }

    pub async fn list_user_repositories(
        &self,
        page: u32,
        per_page: u32,
    ) -> Result<Vec<GitHubRepository>, GitHubClientError> {
        let url = format!("{GITHUB_API_BASE}/user/repos");
        let repos = self
            .http
            .get(url)
            .query(&[
                ("type", "all"),
                ("sort", "updated"),
                ("direction", "desc"),
                ("page", &page.to_string()),
                ("per_page", &per_page.to_string()),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<Vec<GitHubRepository>>()
            .await?;

        Ok(repos)
    }

    pub async fn list_all_user_repositories(
        &self,
    ) -> Result<Vec<GitHubRepository>, GitHubClientError> {
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
    ) -> Result<GitTreeResponse, GitHubClientError> {
        let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{git_ref}");
        let tree = self
            .http
            .get(url)
            .query(&[("recursive", "1")])
            .send()
            .await?
            .error_for_status()?
            .json::<GitTreeResponse>()
            .await?;

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

    pub async fn file_content(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        git_ref: &str,
    ) -> Result<FileContent, GitHubClientError> {
        let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}");
        let response = self
            .http
            .get(url)
            .query(&[("ref", git_ref)])
            .send()
            .await?
            .error_for_status()?
            .json::<ContentsResponse>()
            .await?;

        let raw =
            decode_content_payload(response.encoding.as_deref(), response.content.as_deref())?;
        let content = String::from_utf8(raw).map_err(|_| GitHubClientError::NonUtf8Content)?;

        Ok(FileContent { sha: response.sha, path: response.path, content })
    }

    pub async fn upsert_file(
        &self,
        input: UpsertFileInput<'_>,
    ) -> Result<UpsertFileResponse, GitHubClientError> {
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
            .http
            .put(url)
            .json(&payload)
            .send()
            .await?
            .error_for_status()?
            .json::<UpsertFileResponse>()
            .await?;

        Ok(response)
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
    use crate::{GitHubClient, GitTreeEntry, decode_content_payload};

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
    fn decodes_base64_content_with_newlines() {
        let decoded = decode_content_payload(Some("base64"), Some("SGVsbG8sIFdvcmxkIQ==\n"))
            .expect("must decode");

        assert_eq!(decoded, b"Hello, World!");
    }
}
