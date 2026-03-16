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
    use pulldown_cmark::{Options, Parser};

    pub fn parse(content: &str) -> Result<ParsedDocument, ParseError> {
        let mut options = Options::empty();
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_TASKLISTS);
        options.insert(Options::ENABLE_FOOTNOTES);
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

        let parser = Parser::new_ext(content, options);
        for _ in parser {}

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
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn parses_supported_formats() {
        let md = parse("notes/readme.md", "# hello").expect("markdown should parse");
        assert_eq!(md.format, DocumentFormat::Markdown);

        let org = parse("notes/today.org", "* TODO title").expect("org should parse");
        assert_eq!(org.format, DocumentFormat::Org);

        let norg = parse("notes/today.norg", "* heading").expect("norg should parse");
        assert_eq!(norg.format, DocumentFormat::Neorg);
    }

    #[test]
    fn parses_markdown_gfm_features() {
        let source = "# Title\n\n- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
        let md = parse("notes/readme.md", source).expect("markdown with gfm should parse");
        assert_eq!(md.format, DocumentFormat::Markdown);
        assert_eq!(md.source, source);
    }

    #[test]
    fn snapshots_markdown_fixture() {
        let source = load_fixture("markdown/basic.md");
        let doc = parse("fixtures/basic.md", source.as_str()).expect("fixture should parse");

        insta::assert_snapshot!(format!("{doc:#?}"));
    }

    fn load_fixture(relative: &str) -> String {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let fixture = manifest_dir.join("../../tests/fixtures").join(relative);
        fs::read_to_string(fixture).expect("fixture file should exist")
    }
}
