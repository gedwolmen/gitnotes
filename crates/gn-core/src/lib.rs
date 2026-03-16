use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum DocumentFormat {
    Org,
    Neorg,
    Markdown,
}

impl DocumentFormat {
    pub fn from_path(path: &str) -> Option<Self> {
        match Path::new(path).extension().and_then(|ext| ext.to_str()) {
            Some("org") => Some(Self::Org),
            Some("norg") => Some(Self::Neorg),
            Some("md") => Some(Self::Markdown),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct RepositoryId {
    pub owner: String,
    pub name: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct NoteFileRef {
    pub repository: RepositoryId,
    pub path: String,
    pub format: DocumentFormat,
}

#[cfg(test)]
mod tests {
    use super::DocumentFormat;

    #[test]
    fn detects_supported_extensions() {
        assert_eq!(DocumentFormat::from_path("notes/today.org"), Some(DocumentFormat::Org));
        assert_eq!(DocumentFormat::from_path("notes/today.norg"), Some(DocumentFormat::Neorg));
        assert_eq!(DocumentFormat::from_path("notes/today.md"), Some(DocumentFormat::Markdown));
        assert_eq!(DocumentFormat::from_path("notes/today.txt"), None);
    }
}
