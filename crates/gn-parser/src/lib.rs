use gn_core::DocumentFormat;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("unsupported format for path: {0}")]
    UnsupportedFormat(String),
    #[error("parser not implemented yet for format: {0:?}")]
    NotImplemented(DocumentFormat),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParsedDocument {
    pub format: DocumentFormat,
    pub source: String,
}

pub fn parse(path: &str, content: &str) -> Result<ParsedDocument, ParseError> {
    let Some(format) = DocumentFormat::from_path(path) else {
        return Err(ParseError::UnsupportedFormat(path.to_owned()));
    };

    match format {
        DocumentFormat::Markdown => markdown::parse(content),
        DocumentFormat::Org => org::parse(content),
        DocumentFormat::Neorg => neorg::parse(content),
    }
}

pub mod markdown {
    use crate::{ParseError, ParsedDocument};
    use gn_core::DocumentFormat;

    pub fn parse(content: &str) -> Result<ParsedDocument, ParseError> {
        Ok(ParsedDocument { format: DocumentFormat::Markdown, source: content.to_owned() })
    }
}

pub mod org {
    use crate::{ParseError, ParsedDocument};
    use gn_core::DocumentFormat;

    pub fn parse(content: &str) -> Result<ParsedDocument, ParseError> {
        Ok(ParsedDocument { format: DocumentFormat::Org, source: content.to_owned() })
    }
}

pub mod neorg {
    use crate::{ParseError, ParsedDocument};
    use gn_core::DocumentFormat;

    pub fn parse(content: &str) -> Result<ParsedDocument, ParseError> {
        Ok(ParsedDocument { format: DocumentFormat::Neorg, source: content.to_owned() })
    }
}

#[cfg(test)]
mod tests {
    use crate::parse;
    use gn_core::DocumentFormat;

    #[test]
    fn parses_supported_formats() {
        let md = parse("notes/readme.md", "# hello").expect("markdown should parse");
        assert_eq!(md.format, DocumentFormat::Markdown);

        let org = parse("notes/today.org", "* TODO title").expect("org should parse");
        assert_eq!(org.format, DocumentFormat::Org);

        let norg = parse("notes/today.norg", "* heading").expect("norg should parse");
        assert_eq!(norg.format, DocumentFormat::Neorg);
    }
}
