use gn_core::DocumentFormat;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GitHubClientError {
    #[error("token cannot be empty")]
    EmptyToken,
}

#[derive(Clone, Debug)]
pub struct GitHubClient {
    token: String,
}

impl GitHubClient {
    pub fn new(token: impl Into<String>) -> Result<Self, GitHubClientError> {
        let token = token.into();
        if token.trim().is_empty() {
            return Err(GitHubClientError::EmptyToken);
        }

        Ok(Self { token })
    }

    pub fn token_len(&self) -> usize {
        self.token.len()
    }

    pub fn filter_supported_note_files<'a>(
        paths: impl IntoIterator<Item = &'a str>,
    ) -> Vec<&'a str> {
        paths.into_iter().filter(|path| DocumentFormat::from_path(path).is_some()).collect()
    }
}

#[cfg(test)]
mod tests {
    use crate::GitHubClient;

    #[test]
    fn filters_supported_extensions() {
        let files = ["a.md", "b.org", "c.norg", "d.txt"];
        let filtered = GitHubClient::filter_supported_note_files(files);
        assert_eq!(filtered, vec!["a.md", "b.org", "c.norg"]);
    }
}
