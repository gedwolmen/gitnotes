use dioxus::prelude::*;
use dioxus_router::prelude::*;
use gn_core::DocumentFormat;
use gn_github::{
    DeviceCodeResponse, FileContent, GitHubClient, GitHubOAuthDeviceClient, GitHubRepository,
    NoteBlob, UpsertFileInput, UserProfile, clear_token_secure, load_token_secure,
    store_token_secure,
};
use gn_parser::parse as parse_document;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, PartialEq, Routable)]
enum Route {
    #[route("/")]
    Home {},
    #[route("/login")]
    Login {},
    #[route("/repos")]
    Repos {},
    #[route("/files")]
    Files {},
    #[route("/viewer")]
    Viewer {},
    #[route("/settings")]
    Settings {},
}

fn main() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "app=info,gn_github=info".to_owned()),
        )
        .try_init();
    launch(App);
}

type AppResult<T> = Result<T, String>;

#[component]
fn App() -> Element {
    let auth_token = use_context_provider(|| Signal::new(None::<String>));
    use_context_provider(|| Signal::new(None::<RepositorySelection>));
    use_context_provider(|| Signal::new(None::<String>));

    {
        let mut auth_token = auth_token;
        use_effect(move || {
            if auth_token.read().is_none()
                && let Ok(Some(token)) = load_token_secure()
            {
                auth_token.set(Some(token));
            }
        });
    }

    rsx! {
        div { class: "app-shell",
            h1 { "gitnotes" }
            p { "Mobile-first notes app for .org, .norg, and .md backed by GitHub." }
            nav { class: "top-nav",
                Link { to: Route::Home {}, "Home" }
                " | "
                Link { to: Route::Login {}, "Login" }
                " | "
                Link { to: Route::Repos {}, "Repos" }
                " | "
                Link { to: Route::Files {}, "Files" }
                " | "
                Link { to: Route::Viewer {}, "Viewer" }
                " | "
                Link { to: Route::Settings {}, "Settings" }
            }
            Router::<Route> {}
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct RepositorySelection {
    owner: String,
    repo: String,
}

#[component]
fn Home() -> Element {
    let auth_token = use_context::<Signal<Option<String>>>();
    let is_authenticated = auth_token.read().is_some();

    rsx! {
        section {
            h2 { "Welcome" }
            p { "Foundation scaffold is running with Dioxus routing." }
            if is_authenticated {
                p { class: "auth-ok", "Authenticated with GitHub token in session." }
            } else {
                p { class: "auth-missing", "Not authenticated yet. Go to Login route." }
            }
            ul {
                li { "Auth and repo browser are now connected." }
                li { "Parsers are scaffolded in workspace crates." }
                li { "Viewer and editor routes are ready for implementation." }
            }
        }
    }
}

#[component]
fn ErrorBanner(message: String) -> Element {
    rsx! {
        p { class: "error", "Error: {message}" }
    }
}

#[component]
fn Login() -> Element {
    let auth_token = use_context::<Signal<Option<String>>>();
    let device_flow = use_signal(|| None::<DeviceCodeResponse>);
    let auth_error = use_signal(|| None::<String>);
    let auth_status = use_signal(|| "Idle".to_owned());

    let start_flow = {
        let mut device_flow = device_flow;
        let mut auth_error = auth_error;
        let mut auth_status = auth_status;
        move |_| {
            spawn(async move {
                auth_status.set("Requesting device code...".to_owned());
                auth_error.set(None);
                let client_id = match std::env::var("GITNOTES_GITHUB_CLIENT_ID") {
                    Ok(value) if !value.trim().is_empty() => value,
                    _ => {
                        auth_status.set("Failed".to_owned());
                        auth_error.set(Some(
                            "Missing GITNOTES_GITHUB_CLIENT_ID environment variable".to_owned(),
                        ));
                        return;
                    }
                };

                let oauth = match GitHubOAuthDeviceClient::new(client_id) {
                    Ok(client) => client,
                    Err(err) => {
                        auth_status.set("Failed".to_owned());
                        auth_error.set(Some(err.to_string()));
                        return;
                    }
                };

                match oauth.request_device_code("repo read:user").await {
                    Ok(code) => {
                        auth_status.set(
                            "Device code ready. Authorize in browser, then complete auth."
                                .to_owned(),
                        );
                        device_flow.set(Some(code));
                    }
                    Err(err) => {
                        auth_status.set("Failed".to_owned());
                        auth_error.set(Some(err.to_string()));
                    }
                }
            });
        }
    };

    let complete_flow = {
        let device_flow_signal = device_flow;
        let mut auth_error = auth_error;
        let mut auth_status = auth_status;
        let mut auth_token = auth_token;
        move |_| {
            let current = device_flow_signal.read().clone();
            spawn(async move {
                let Some(code) = current else {
                    auth_error.set(Some("No device flow started yet".to_owned()));
                    return;
                };

                let client_id = match std::env::var("GITNOTES_GITHUB_CLIENT_ID") {
                    Ok(value) if !value.trim().is_empty() => value,
                    _ => {
                        auth_status.set("Failed".to_owned());
                        auth_error.set(Some(
                            "Missing GITNOTES_GITHUB_CLIENT_ID environment variable".to_owned(),
                        ));
                        return;
                    }
                };

                let oauth = match GitHubOAuthDeviceClient::new(client_id) {
                    Ok(client) => client,
                    Err(err) => {
                        auth_status.set("Failed".to_owned());
                        auth_error.set(Some(err.to_string()));
                        return;
                    }
                };

                auth_status.set("Polling GitHub for token...".to_owned());
                match oauth
                    .poll_access_token(&code.device_code, code.interval, code.expires_in)
                    .await
                {
                    Ok(token) => {
                        let access_token = token.access_token;
                        if let Err(err) = store_token_secure(access_token.as_str()) {
                            auth_error.set(Some(format!("token store failed: {err}")));
                        }
                        auth_token.set(Some(access_token));
                        auth_status.set("Authenticated".to_owned());
                        auth_error.set(None);
                    }
                    Err(err) => {
                        auth_status.set("Failed".to_owned());
                        auth_error.set(Some(err.to_string()));
                    }
                }
            });
        }
    };

    let device_details = device_flow.read().clone();
    let status_text = auth_status.read().clone();
    let error_text = auth_error.read().clone();

    rsx! {
        section {
            h2 { "Login" }
            p { "Authenticate using GitHub Device Flow." }
            p { "Status: {status_text}" }
            button { onclick: start_flow, "Start Device Flow" }
            " "
            button { onclick: complete_flow, "Complete Authentication" }

            if let Some(code) = device_details {
                div {
                    p { "1) Open: {code.verification_uri}" }
                    p { "2) Enter code: {code.user_code}" }
                    p { "3) Return and press Complete Authentication" }
                }
            }

            if let Some(err) = error_text {
                p { class: "error", "Error: {err}" }
            }
        }
    }
}

#[component]
fn Repos() -> Element {
    let auth_token = use_context::<Signal<Option<String>>>();
    let selected_repo = use_context::<Signal<Option<RepositorySelection>>>();
    let mut search = use_signal(String::new);
    let refresh_nonce = use_signal(|| 0_u32);

    {
        let mut selected_repo = selected_repo;
        use_effect(move || {
            if selected_repo.read().is_none() {
                selected_repo.set(load_saved_selection());
            }
        });
    }

    let repos = use_resource(move || {
        let token = auth_token.read().clone();
        let nonce = *refresh_nonce.read();
        async move { load_repositories(token, nonce).await }
    });

    let current_query = search.read().to_lowercase();
    let repos_state = repos.read().clone();
    let content = match repos_state {
        Some(Ok(items)) if items.is_empty() => rsx! {
            p { "No repositories found for this account." }
        },
        Some(Ok(items)) => {
            let filtered: Vec<GitHubRepository> = items
                .into_iter()
                .filter(|repo| {
                    if current_query.is_empty() {
                        return true;
                    }
                    repo.full_name.to_lowercase().contains(current_query.as_str())
                        || repo.name.to_lowercase().contains(current_query.as_str())
                })
                .collect();

            let mut selected_repo = selected_repo;
            rsx! {
                ul {
                    for repo in filtered {
                        li { key: "{repo.id}",
                            strong { "{repo.full_name}" }
                            " "
                            span { "(default: {repo.default_branch})" }
                            " "
                            span { if repo.private { "[private]" } else { "[public]" } }
                            " "
                            span { "updated: {repo.pushed_at:?}" }
                            " "
                            button {
                                onclick: move |_| {
                                    let mut parts = repo.full_name.split('/');
                                    let owner = parts.next().unwrap_or_default().to_owned();
                                    let name = parts.next().unwrap_or_default().to_owned();
                                    if !owner.is_empty() && !name.is_empty() {
                                        let selection = RepositorySelection { owner, repo: name };
                                        save_selection(&selection);
                                        selected_repo.set(Some(selection));
                                    }
                                },
                                "Use"
                            }
                        }
                    }
                }
            }
        }
        Some(Err(err)) => rsx! {
            ErrorBanner { message: format!("Failed to load repositories: {err}") }
            p { "Authenticate via Login route, or set GITNOTES_GITHUB_TOKEN in your environment." }
        },
        None => rsx! {
            p { "Loading repositories..." }
        },
    };

    rsx! {
        section {
            h2 { "Repositories" }
            p { "Authenticated repository listing from GitHub API." }
            p { "Loads all pages (pagination) from GitHub." }
            input {
                placeholder: "Search repositories",
                value: "{search}",
                oninput: move |evt| {
                    search.set(evt.value());
                }
            }
            button {
                onclick: move |_| {
                    let mut nonce = refresh_nonce;
                    nonce += 1;
                },
                "Refresh"
            }
            if let Some(current) = selected_repo.read().as_ref() {
                p { "Selected: {current.owner}/{current.repo}" }
            }
            {content}
        }
    }
}

#[component]
fn Files() -> Element {
    let auth_token = use_context::<Signal<Option<String>>>();
    let selected_repo = use_context::<Signal<Option<RepositorySelection>>>();
    let mut selected_file = use_context::<Signal<Option<String>>>();
    let current_dir = use_signal(String::new);
    let refresh_nonce = use_signal(|| 0_u32);
    let create_status = use_signal(|| None::<String>);
    let files = use_resource(move || {
        let token = auth_token.read().clone();
        let selection = selected_repo.read().clone();
        let nonce = *refresh_nonce.read();
        async move { load_note_files(token, selection, nonce).await }
    });

    let state = files.read().clone();
    let content = match state {
        Some(Ok(items)) if items.is_empty() => rsx! {
            p { "No .org/.norg/.md files found in this repository tree." }
        },
        Some(Ok(items)) => {
            let current = current_dir.read().clone();
            let folders = immediate_folders(&items, current.as_str());
            let files_here = immediate_files(&items, current.as_str());
            let mut current_dir = current_dir;
            let token_for_create = auth_token.read().clone();
            let repo_for_create = selected_repo.read().clone();
            let dir_for_create = current_dir.read().clone();
            let mut create_status = create_status;
            let on_create = move |_| {
                let token = token_for_create.clone();
                let repo = repo_for_create.clone();
                let dir = dir_for_create.clone();
                spawn(async move {
                    create_status.set(Some("Creating note file...".to_owned()));
                    match create_new_markdown_file(token, repo, dir.as_str()).await {
                        Ok(path) => create_status.set(Some(format!("Created {path}"))),
                        Err(err) => create_status.set(Some(format!("Create failed: {err}"))),
                    }
                });
            };

            rsx! {
                div {
                    p { "Breadcrumb: /{current}" }
                    button {
                        onclick: move |_| {
                            current_dir.set(String::new());
                        },
                        "Root"
                    }
                    " "
                    button {
                        onclick: move |_| {
                            let mut nonce = refresh_nonce;
                            nonce += 1;
                        },
                        "Refresh"
                    }
                    " "
                    button { onclick: on_create, "New .md File" }
                    if let Some(status) = create_status.read().as_ref() {
                        p { "{status}" }
                    }

                    h3 { "Folders" }
                    ul {
                        for folder in folders {
                            li { key: "dir-{folder}",
                                button {
                                    onclick: move |_| {
                                        current_dir.set(folder.clone());
                                    },
                                    "{folder}"
                                }
                            }
                        }
                    }

                    h3 { "Files" }
                    ul {
                        for file in files_here {
                            li { key: "file-{file.path}",
                                button {
                                    onclick: move |_| {
                                        selected_file.set(Some(file.path.clone()));
                                    },
                                    "{file_badge(&file.format)} {file.path} ({human_size(file.size)})"
                                }
                            }
                        }
                    }
                }
            }
        }
        Some(Err(err)) => rsx! {
            ErrorBanner { message: format!("Failed to load file tree: {err}") }
            p { "Select a repository in Repos route, then authenticate." }
        },
        None => rsx! {
            p { "Loading repository tree..." }
        },
    };

    rsx! {
        section {
            h2 { "File Browser" }
            p { "Filtered .org, .norg, and .md files from GitHub tree API." }
            p { "Tap a file to select it for Viewer route." }
            {content}
        }
    }
}

#[component]
fn Viewer() -> Element {
    let auth_token = use_context::<Signal<Option<String>>>();
    let selected_repo = use_context::<Signal<Option<RepositorySelection>>>();
    let selected_file = use_context::<Signal<Option<String>>>();
    let save_status = use_signal(|| None::<String>);
    let mut commit_message = use_signal(String::new);
    let mut edit_mode = use_signal(|| false);
    let mut draft_content = use_signal(String::new);
    let document = use_resource(move || {
        let token = auth_token.read().clone();
        let selection = selected_repo.read().clone();
        let file_path = selected_file.read().clone();
        async move { load_current_file(token, selection, file_path).await }
    });

    let content = match &*document.read() {
        Some(Ok(file)) => {
            let frontmatter = parse_document(file.path.as_str(), file.content.as_str())
                .ok()
                .and_then(|doc| doc.frontmatter);
            let current = file.clone();
            let token_for_save = auth_token.read().clone();
            let selection_for_save = selected_repo.read().clone();
            let file_for_save = selected_file.read().clone();
            let edit_mode_for_ui = *edit_mode.read();
            let draft_snapshot = draft_content.read().clone();
            let save_message = {
                let current_text = commit_message.read().clone();
                if current_text.trim().is_empty() {
                    format!("Update {} from gitnotes", file.path)
                } else {
                    current_text
                }
            };
            let mut save_status = save_status;
            let on_save = move |_| {
                let token = token_for_save.clone();
                let selection = selection_for_save.clone();
                let selected = file_for_save.clone();
                let file = current.clone();
                let message = save_message.clone();
                let content = if draft_snapshot.is_empty() {
                    file.content.clone()
                } else {
                    draft_snapshot.clone()
                };
                spawn(async move {
                    save_status.set(Some("Saving file to GitHub...".to_owned()));
                    let result = save_current_file(
                        token,
                        selection,
                        selected,
                        &file,
                        content.as_str(),
                        message.as_str(),
                    )
                    .await;
                    match result {
                        Ok(commit_sha) => {
                            save_status
                                .set(Some(format!("Saved successfully. Commit: {commit_sha}")));
                        }
                        Err(err) => {
                            save_status.set(Some(format!("Save failed: {err}")));
                        }
                    }
                });
            };

            rsx! {
                div {
                    p { "Path: {file.path}" }
                    p { "SHA: {file.sha}" }
                    if let Some(meta) = frontmatter {
                        h4 { "Frontmatter" }
                        pre { "{meta}" }
                    }
                    button {
                        onclick: move |_| {
                            edit_mode.set(!edit_mode_for_ui);
                        },
                        if edit_mode_for_ui { "Switch to View" } else { "Switch to Edit" }
                    }
                    input {
                        placeholder: "Commit message",
                        value: "{commit_message}",
                        oninput: move |evt| {
                            commit_message.set(evt.value());
                        }
                    }
                    if edit_mode_for_ui {
                        textarea {
                            rows: "20",
                            cols: "120",
                            value: if draft_content.read().is_empty() {
                                file.content.clone()
                            } else {
                                draft_content.read().clone()
                            },
                            oninput: move |evt| {
                                draft_content.set(evt.value());
                            }
                        }
                        button {
                            onclick: move |_| {
                                draft_content.set(String::new());
                            },
                            "Reset Draft"
                        }
                    } else {
                        pre { "{file.content}" }
                    }
                    button { onclick: on_save, "Save to GitHub" }
                }
            }
        }
        Some(Err(err)) => rsx! {
            ErrorBanner { message: format!("Failed to load file: {err}") }
            p { "Set GITNOTES_FILE_PATH, select repository, then authenticate." }
        },
        None => rsx! {
            p { "Loading file content..." }
        },
    };

    rsx! {
        section {
            h2 { "Viewer" }
            p { "Read mode for Org, Neorg, and Markdown documents." }
            if let Some(status) = save_status.read().as_ref() {
                p { "{status}" }
            }
            {content}
        }
    }
}

#[component]
fn Settings() -> Element {
    let mut auth_token = use_context::<Signal<Option<String>>>();
    let profile = use_resource(move || {
        let token = auth_token.read().clone();
        async move { load_user_profile(token).await }
    });

    let is_authenticated = auth_token.read().is_some();
    let logout = move |_| {
        let _ = clear_token_secure();
        auth_token.set(None);
    };

    let profile_block = match &*profile.read() {
        Some(Ok(p)) => rsx! {
            div {
                p { "User: {p.login}" }
                if let Some(name) = &p.name {
                    p { "Name: {name}" }
                }
                p { "Avatar: {p.avatar_url}" }
            }
        },
        Some(Err(err)) => rsx! {
            ErrorBanner { message: format!("Profile load failed: {err}") }
        },
        None => rsx! {
            p { "Loading profile..." }
        },
    };

    rsx! {
        section {
            h2 { "Settings" }
            p { "Theme, caching, and account controls will live here." }
            if is_authenticated {
                p { "Authentication: active" }
                button { onclick: logout, "Logout" }
                {profile_block}
            } else {
                p { "Authentication: not active" }
            }
        }
    }
}

async fn load_repositories(
    session_token: Option<String>,
    _refresh_nonce: u32,
) -> AppResult<Vec<GitHubRepository>> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    client.list_all_user_repositories().await.map_err(|err| err.to_string())
}

async fn load_note_files(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    _refresh_nonce: u32,
) -> AppResult<Vec<NoteBlob>> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    let tree = client
        .repository_tree(selection.owner.as_str(), selection.repo.as_str(), git_ref.as_str())
        .await
        .map_err(|err| err.to_string())?;

    Ok(GitHubClient::filter_note_blobs(&tree.tree))
}

async fn load_current_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    selected_file: Option<String>,
) -> AppResult<FileContent> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());
    let path = selected_file
        .or_else(|| std::env::var("GITNOTES_FILE_PATH").ok())
        .ok_or_else(|| "missing selected file (tap one in Files route)".to_owned())?;

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    client
        .file_content(
            selection.owner.as_str(),
            selection.repo.as_str(),
            path.as_str(),
            git_ref.as_str(),
        )
        .await
        .map_err(|err| err.to_string())
}

async fn save_current_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    selected_file: Option<String>,
    file: &FileContent,
    content: &str,
    commit_message: &str,
) -> AppResult<String> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    let target_path = selected_file.unwrap_or_else(|| file.path.clone());
    let response = client
        .upsert_file(UpsertFileInput {
            owner: selection.owner.as_str(),
            repo: selection.repo.as_str(),
            path: target_path.as_str(),
            message: commit_message,
            content,
            sha: Some(file.sha.as_str()),
            branch: Some(git_ref.as_str()),
            committer: None,
        })
        .await
        .map_err(|err| err.to_string())?;

    Ok(response.commit.sha)
}

async fn load_user_profile(session_token: Option<String>) -> AppResult<UserProfile> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    client.user_profile().await.map_err(|err| err.to_string())
}

async fn create_new_markdown_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    current_dir: &str,
) -> AppResult<String> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());
    let file_name = format!("note-{}.md", unix_ts());
    let path =
        if current_dir.is_empty() { file_name } else { format!("{current_dir}/{file_name}") };

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    client
        .upsert_file(UpsertFileInput {
            owner: selection.owner.as_str(),
            repo: selection.repo.as_str(),
            path: path.as_str(),
            message: &format!("Create {path} from gitnotes"),
            content: "# New Note\n\nCreated by gitnotes.\n",
            sha: None,
            branch: Some(git_ref.as_str()),
            committer: None,
        })
        .await
        .map_err(|err| err.to_string())?;

    Ok(path)
}

fn session_file_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_owned());
    PathBuf::from(home).join(".gitnotes-session.json")
}

fn load_saved_selection() -> Option<RepositorySelection> {
    let path = session_file_path();
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str::<RepositorySelection>(raw.as_str()).ok()
}

fn save_selection(selection: &RepositorySelection) {
    let path = session_file_path();
    if let Ok(serialized) = serde_json::to_string(selection) {
        let _ = fs::write(path, serialized);
    }
}

fn immediate_folders(items: &[NoteBlob], current_dir: &str) -> Vec<String> {
    let mut folders = Vec::<String>::new();
    for item in items {
        if let Some(rest) = strip_prefix_dir(item.path.as_str(), current_dir)
            && let Some((first, _)) = rest.split_once('/')
        {
            let candidate = if current_dir.is_empty() {
                first.to_owned()
            } else {
                format!("{current_dir}/{first}")
            };
            if !folders.iter().any(|f| f == candidate.as_str()) {
                folders.push(candidate);
            }
        }
    }
    folders.sort();
    folders
}

fn immediate_files(items: &[NoteBlob], current_dir: &str) -> Vec<NoteBlob> {
    let mut files = Vec::<NoteBlob>::new();
    for item in items {
        if let Some(rest) = strip_prefix_dir(item.path.as_str(), current_dir)
            && !rest.contains('/')
        {
            files.push(item.clone());
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files
}

fn strip_prefix_dir<'a>(path: &'a str, current_dir: &str) -> Option<&'a str> {
    if current_dir.is_empty() {
        return Some(path);
    }
    let prefix = format!("{current_dir}/");
    path.strip_prefix(prefix.as_str())
}

fn file_badge(format: &DocumentFormat) -> &'static str {
    match format {
        DocumentFormat::Org => "[ORG]",
        DocumentFormat::Neorg => "[NORG]",
        DocumentFormat::Markdown => "[MD]",
    }
}

fn human_size(size: Option<u64>) -> String {
    let Some(bytes) = size else {
        return "unknown".to_owned();
    };
    if bytes >= 1024 * 1024 {
        return format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0));
    }
    if bytes >= 1024 {
        return format!("{:.1} KB", bytes as f64 / 1024.0);
    }
    format!("{bytes} B")
}

fn unix_ts() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}
