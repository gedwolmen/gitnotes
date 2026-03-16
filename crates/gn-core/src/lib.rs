use serde::{Deserialize, Serialize};
use std::fmt;
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

impl fmt::Display for DocumentFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Org => write!(f, "org"),
            Self::Neorg => write!(f, "norg"),
            Self::Markdown => write!(f, "markdown"),
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

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct SourceSpan {
    pub start: usize,
    pub end: usize,
}

impl SourceSpan {
    pub fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Document {
    pub format: DocumentFormat,
    pub metadata: Metadata,
    pub nodes: Vec<Node>,
}

impl fmt::Display for Document {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Document(format={}, title={:?}, nodes={})",
            self.format,
            self.metadata.title,
            self.nodes.len()
        )
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, Default)]
pub struct Metadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub date: Option<String>,
    pub tags: Vec<String>,
    pub properties: Vec<(String, String)>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum Node {
    Heading(HeadingNode),
    Paragraph(ParagraphNode),
    List(ListNode),
    Quote(QuoteNode),
    CodeBlock(CodeBlockNode),
    Table(TableNode),
    HorizontalRule { span: Option<SourceSpan> },
    Drawer(DrawerNode),
    Block(BlockNode),
}

impl fmt::Display for Node {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Heading(node) => {
                write!(f, "Heading(level={}, title={:?})", node.level, node.title)
            }
            Self::Paragraph(node) => write!(f, "Paragraph(inlines={})", node.content.len()),
            Self::List(node) => write!(f, "List(kind={}, items={})", node.kind, node.items.len()),
            Self::Quote(node) => write!(f, "Quote(children={})", node.children.len()),
            Self::CodeBlock(node) => {
                write!(f, "CodeBlock(lang={:?}, bytes={})", node.language, node.content.len())
            }
            Self::Table(node) => write!(f, "Table(rows={})", node.rows.len()),
            Self::HorizontalRule { .. } => write!(f, "HorizontalRule"),
            Self::Drawer(node) => {
                write!(f, "Drawer(name={}, children={})", node.name, node.children.len())
            }
            Self::Block(node) => {
                write!(f, "Block(kind={}, children={})", node.kind, node.children.len())
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct HeadingNode {
    pub level: u8,
    pub title: InlineContent,
    pub todo_state: Option<TodoState>,
    pub priority: Option<Priority>,
    pub tags: Vec<String>,
    pub timestamps: Vec<Timestamp>,
    pub children: Vec<Node>,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ParagraphNode {
    pub content: InlineContent,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ListNode {
    pub kind: ListKind,
    pub items: Vec<ListItem>,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ListItem {
    pub checkbox: Option<bool>,
    pub content: InlineContent,
    pub children: Vec<Node>,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct QuoteNode {
    pub children: Vec<Node>,
    pub level: u8,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CodeBlockNode {
    pub language: Option<String>,
    pub content: String,
    pub metadata: Vec<(String, String)>,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TableNode {
    pub headers: Vec<TableCell>,
    pub rows: Vec<Vec<TableCell>>,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TableCell {
    pub content: InlineContent,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct DrawerNode {
    pub name: String,
    pub children: Vec<Node>,
    pub span: Option<SourceSpan>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct BlockNode {
    pub kind: String,
    pub attributes: Vec<(String, String)>,
    pub children: Vec<Node>,
    pub span: Option<SourceSpan>,
}

pub type InlineContent = Vec<Inline>;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum Inline {
    Text { value: String, span: Option<SourceSpan> },
    Emphasis { content: InlineContent, span: Option<SourceSpan> },
    Strong { content: InlineContent, span: Option<SourceSpan> },
    Strike { content: InlineContent, span: Option<SourceSpan> },
    Underline { content: InlineContent, span: Option<SourceSpan> },
    Superscript { content: InlineContent, span: Option<SourceSpan> },
    Subscript { content: InlineContent, span: Option<SourceSpan> },
    Code { value: String, span: Option<SourceSpan> },
    Link { target: String, description: Option<InlineContent>, span: Option<SourceSpan> },
    Tag { name: String, span: Option<SourceSpan> },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum ListKind {
    Unordered,
    Ordered,
    Description,
}

impl fmt::Display for ListKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unordered => write!(f, "unordered"),
            Self::Ordered => write!(f, "ordered"),
            Self::Description => write!(f, "description"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum TodoState {
    Todo,
    Done,
    Pending,
    InProgress,
    Waiting,
    Hold,
    Cancelled,
    Recurring,
    Raw(String),
}

impl fmt::Display for TodoState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Todo => write!(f, "TODO"),
            Self::Done => write!(f, "DONE"),
            Self::Pending => write!(f, "PENDING"),
            Self::InProgress => write!(f, "IN-PROGRESS"),
            Self::Waiting => write!(f, "WAITING"),
            Self::Hold => write!(f, "HOLD"),
            Self::Cancelled => write!(f, "CANCELLED"),
            Self::Recurring => write!(f, "RECURRING"),
            Self::Raw(value) => write!(f, "{value}"),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum Priority {
    A,
    B,
    C,
    Numeric(u8),
}

impl fmt::Display for Priority {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::A => write!(f, "A"),
            Self::B => write!(f, "B"),
            Self::C => write!(f, "C"),
            Self::Numeric(value) => write!(f, "{value}"),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum TimestampKind {
    Active,
    Inactive,
    Scheduled,
    Deadline,
    Closed,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Timestamp {
    pub kind: TimestampKind,
    pub date: String,
    pub time: Option<String>,
    pub end_date: Option<String>,
    pub end_time: Option<String>,
    pub repeater: Option<String>,
    pub warning: Option<String>,
    pub span: Option<SourceSpan>,
}

#[cfg(test)]
mod tests {
    use super::{Document, DocumentFormat, Metadata, Node};

    #[test]
    fn detects_supported_extensions() {
        assert_eq!(DocumentFormat::from_path("notes/today.org"), Some(DocumentFormat::Org));
        assert_eq!(DocumentFormat::from_path("notes/today.norg"), Some(DocumentFormat::Neorg));
        assert_eq!(DocumentFormat::from_path("notes/today.md"), Some(DocumentFormat::Markdown));
        assert_eq!(DocumentFormat::from_path("notes/today.txt"), None);
    }

    #[test]
    fn document_display_is_stable() {
        let doc = Document {
            format: DocumentFormat::Markdown,
            metadata: Metadata { title: Some("Demo".to_owned()), ..Metadata::default() },
            nodes: Vec::<Node>::new(),
        };

        assert_eq!(doc.to_string(), "Document(format=markdown, title=Some(\"Demo\"), nodes=0)");
    }
}
