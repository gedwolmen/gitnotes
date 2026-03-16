use dioxus::prelude::*;
use dioxus_router::prelude::*;
use gn_core::DocumentFormat;
use gn_github::{
    DeleteFileInput, DeviceCodeResponse, FileContent, GitHubClient, GitHubOAuthDeviceClient,
    GitHubRepository, NoteBlob, RateLimitInfo, UpsertFileInput, UserProfile, clear_token_secure,
    load_token_secure, store_token_secure,
};
use gn_parser::parse as parse_document;
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd, html};
use rusqlite::{Connection, params};
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
    let mut selected_repo = use_context_provider(|| Signal::new(None::<RepositorySelection>));
    use_context_provider(|| Signal::new(None::<String>));
    use_context_provider(|| Signal::new(false));
    let recent_repos = use_context_provider(|| Signal::new(load_recent_repos()));
    let settings = use_context_provider(|| Signal::new(load_settings().unwrap_or_default()));

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

    {
        let mut recent_repos = recent_repos;
        let selected_repo = selected_repo;
        use_effect(move || {
            if let Some(current) = selected_repo.read().clone() {
                remember_recent_repo(&current);
                recent_repos.set(load_recent_repos());
            }
        });
    }

    let selected_repo_label = selected_repo
        .read()
        .as_ref()
        .map(|r| format!("{}/{}", r.owner, r.repo))
        .unwrap_or_else(|| "none".to_owned());

    rsx! {
        div {
            class: "app-shell {theme_class(settings.read().theme.as_str())}",
            style: "{app_theme_style(settings.read().theme.as_str())}",
            h1 { "gitnotes" }
            p { "Mobile-first notes app for .org, .norg, and .md backed by GitHub." }
            p { "Current repo: {selected_repo_label}" }
            select {
                value: "{selected_repo_label}",
                oninput: move |evt| {
                    if let Some(selection) = parse_repo_selection(evt.value().as_str()) {
                        selected_repo.set(Some(selection));
                    }
                },
                option { value: "none", "Select recent repo" }
                for repo in recent_repos.read().iter() {
                    option {
                        value: "{repo.owner}/{repo.repo}",
                        "{repo.owner}/{repo.repo}"
                    }
                }
            }
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

#[derive(Clone, Debug)]
struct RepositoryLoadResult {
    repositories: Vec<GitHubRepository>,
    rate_limit: Option<RateLimitInfo>,
}

#[derive(Clone, Debug)]
struct RecentFileEntry {
    owner: String,
    repo: String,
    path: String,
    format: DocumentFormat,
    opened_at_unix: i64,
}

#[derive(Clone, Debug)]
struct FavoriteFileEntry {
    owner: String,
    repo: String,
    path: String,
    format: DocumentFormat,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct MarkdownHeading {
    level: u8,
    text: String,
    id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct AppSettings {
    theme: String,
    default_editor_mode: String,
    default_new_file_format: String,
    font_size: String,
    font_family: String,
    line_wrapping: bool,
    show_line_numbers: bool,
    auto_save_interval_seconds: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_owned(),
            default_editor_mode: "view".to_owned(),
            default_new_file_format: "md".to_owned(),
            font_size: "medium".to_owned(),
            font_family: "monospace".to_owned(),
            line_wrapping: true,
            show_line_numbers: false,
            auto_save_interval_seconds: 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum FileActionKind {
    Delete,
    Rename,
    Move,
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
fn MarkdownPreview(content: String) -> Element {
    let headings = markdown_headings(content.as_str());
    let mut active_heading = use_signal(|| None::<String>);
    let html_content = markdown_to_html(content.as_str(), &headings);

    rsx! {
        div {
            if !headings.is_empty() {
                h4 { "Table of Contents" }
                ul {
                    for heading in headings {
                        {
                            let heading_id_for_click = heading.id.clone();
                            let heading_id_for_link = heading.id.clone();
                            let heading_text = heading.text;
                            let heading_level = heading.level;
                            let is_active = active_heading.read().as_deref() == Some(heading_id_for_click.as_str());
                            rsx! {
                                li {
                                    button {
                                        onclick: move |_| {
                                            active_heading.set(Some(heading_id_for_click.clone()));
                                        },
                                        if is_active {
                                            "-> [{heading_level}] {heading_text}"
                                        } else {
                                            "   [{heading_level}] {heading_text}"
                                        }
                                    }
                                    " "
                                    a { href: "#{heading_id_for_link}", "Jump" }
                                }
                            }
                        }
                    }
                }
            }
            div { dangerous_inner_html: "{html_content}" }
        }
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
        Some(Ok(result)) if result.repositories.is_empty() => rsx! {
            p { "No repositories found for this account." }
        },
        Some(Ok(result)) => {
            let filtered: Vec<GitHubRepository> = result
                .repositories
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
                if let Some(rate) = result.rate_limit {
                    if rate.remaining < 500 {
                        p { class: "warning", "GitHub rate limit low: {rate.remaining} requests remaining." }
                    }
                }
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
            button {
                onclick: move |_| {
                    let mut nonce = refresh_nonce;
                    nonce += 1;
                },
                "Retry"
            }
        },
        None => rsx! {
            p { "Loading repositories..." }
            ul {
                li { "Loading repository 1..." }
                li { "Loading repository 2..." }
                li { "Loading repository 3..." }
            }
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
    let settings = use_context::<Signal<AppSettings>>();
    let selected_file = use_context::<Signal<Option<String>>>();
    let open_viewer_in_edit = use_context::<Signal<bool>>();
    let navigator = use_navigator();
    let current_dir = use_signal(String::new);
    let mut refresh_nonce = use_signal(|| 0_u32);
    let recent_history_nonce = use_signal(|| 0_u32);
    let favorites_nonce = use_signal(|| 0_u32);
    let create_status = use_signal(|| None::<String>);
    let show_create_form = use_signal(|| false);
    let mut create_name = use_signal(String::new);
    let mut create_format = use_signal(|| settings.read().default_new_file_format.clone());
    let action_file = use_signal(|| None::<String>);
    let action_kind = use_signal(|| None::<FileActionKind>);
    let action_input = use_signal(String::new);
    let action_status = use_signal(|| None::<String>);
    let files = use_resource(move || {
        let token = auth_token.read().clone();
        let selection = selected_repo.read().clone();
        let nonce = *refresh_nonce.read();
        async move { load_note_files(token, selection, nonce).await }
    });
    let recent_history = use_resource(move || {
        let nonce = *recent_history_nonce.read();
        async move { load_recent_file_history(nonce).await }
    });
    let favorites = use_resource(move || {
        let nonce = *favorites_nonce.read();
        async move { load_favorites(nonce).await }
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
            let mut selected_file = selected_file;
            let mut selected_repo_signal = selected_repo;
            let selected_repo_for_history = selected_repo;
            let mut open_viewer_in_edit = open_viewer_in_edit;
            let mut show_create_form = show_create_form;
            let mut action_file = action_file;
            let mut action_kind = action_kind;
            let mut action_status = action_status;
            let mut action_input = action_input;
            let file_name_for_create = create_name.read().clone();
            let file_format_for_create = create_format.read().clone();
            let mut recent_history_nonce = recent_history_nonce;
            let recent_state = recent_history.read().clone();
            let mut favorites_nonce = favorites_nonce;
            let favorites_state = favorites.read().clone();
            let nav_for_create = navigator;
            let repo_for_create_on_create = repo_for_create.clone();
            let on_create = move |_| {
                let token = token_for_create.clone();
                let repo = repo_for_create_on_create.clone();
                let dir = dir_for_create.clone();
                let file_name = file_name_for_create.clone();
                let format = file_format_for_create.clone();
                spawn(async move {
                    let Some(parsed_format) = parse_note_format(format.as_str()) else {
                        create_status
                            .set(Some("Create failed: invalid format selected".to_owned()));
                        return;
                    };

                    create_status.set(Some("Creating file...".to_owned()));
                    let format_for_history = parsed_format;
                    let repo_for_history = repo.clone();
                    match create_new_note_file(
                        token,
                        repo,
                        dir.as_str(),
                        file_name.as_str(),
                        parsed_format,
                    )
                    .await
                    {
                        Ok(path) => {
                            if let Some(selection) = repo_for_history.as_ref() {
                                let _ = record_recent_file_open(
                                    selection.owner.as_str(),
                                    selection.repo.as_str(),
                                    path.as_str(),
                                    &format_for_history,
                                );
                            }
                            let next = *recent_history_nonce.read() + 1;
                            recent_history_nonce.set(next);
                            selected_file.set(Some(path.clone()));
                            open_viewer_in_edit.set(true);
                            show_create_form.set(false);
                            create_status.set(Some(format!("Created {path}")));
                            nav_for_create.push(Route::Viewer {});
                        }
                        Err(err) => {
                            create_status.set(Some(format!("Create failed: {err}")));
                        }
                    }
                });
            };

            let token_for_actions = auth_token.read().clone();
            let repo_for_actions = selected_repo.read().clone();
            let on_confirm_action = move |_| {
                let token = token_for_actions.clone();
                let repo = repo_for_actions.clone();
                let target_file = action_file.read().clone();
                let kind = *action_kind.read();
                let input = action_input.read().clone();
                spawn(async move {
                    let Some(path) = target_file else {
                        action_status.set(Some("No file selected for action".to_owned()));
                        return;
                    };
                    let Some(kind_value) = kind else {
                        action_status.set(Some("No action selected".to_owned()));
                        return;
                    };

                    match kind_value {
                        FileActionKind::Delete => {
                            action_status.set(Some(format!("Deleting {path}...")));
                            match delete_note_file(token, repo, path.as_str()).await {
                                Ok(()) => {
                                    action_status.set(Some(format!("Deleted {path}")));
                                    action_file.set(None);
                                    action_kind.set(None);
                                    action_input.set(String::new());
                                    if selected_file.read().as_deref() == Some(path.as_str()) {
                                        selected_file.set(None);
                                    }
                                    let next = *refresh_nonce.read() + 1;
                                    refresh_nonce.set(next);
                                }
                                Err(err) => {
                                    action_status.set(Some(format!("Delete failed: {err}")))
                                }
                            }
                        }
                        FileActionKind::Rename => {
                            action_status.set(Some(format!("Renaming {path}...")));
                            match rename_note_file(token, repo, path.as_str(), input.as_str()).await
                            {
                                Ok(new_path) => {
                                    action_status.set(Some(format!("Renamed to {new_path}")));
                                    action_file.set(None);
                                    action_kind.set(None);
                                    action_input.set(String::new());
                                    selected_file.set(Some(new_path));
                                    let next = *refresh_nonce.read() + 1;
                                    refresh_nonce.set(next);
                                }
                                Err(err) => {
                                    action_status.set(Some(format!("Rename failed: {err}")))
                                }
                            }
                        }
                        FileActionKind::Move => {
                            action_status.set(Some(format!("Moving {path}...")));
                            match move_note_file(token, repo, path.as_str(), input.as_str()).await {
                                Ok(new_path) => {
                                    action_status.set(Some(format!("Moved to {new_path}")));
                                    action_file.set(None);
                                    action_kind.set(None);
                                    action_input.set(String::new());
                                    selected_file.set(Some(new_path));
                                    let next = *refresh_nonce.read() + 1;
                                    refresh_nonce.set(next);
                                }
                                Err(err) => action_status.set(Some(format!("Move failed: {err}"))),
                            }
                        }
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
                    button {
                        onclick: move |_| {
                            let next = !*show_create_form.read();
                            show_create_form.set(next);
                        },
                        "New File"
                    }
                    if let Some(status) = create_status.read().as_ref() {
                        p { "{status}" }
                    }
                    if let Some(status) = action_status.read().as_ref() {
                        p { "{status}" }
                    }
                    if *show_create_form.read() {
                        div {
                            h4 { "Create File" }
                            input {
                                placeholder: "File name (no extension)",
                                value: "{create_name}",
                                oninput: move |evt| {
                                    create_name.set(evt.value());
                                }
                            }
                            select {
                                value: "{create_format}",
                                oninput: move |evt| {
                                    create_format.set(evt.value());
                                },
                                option { value: "md", ".md" }
                                option { value: "org", ".org" }
                                option { value: "norg", ".norg" }
                            }
                            button { onclick: on_create, "Create" }
                        }
                    }

                    if let Some(target) = action_file.read().as_ref() {
                        div {
                            h4 { "File Action: {target}" }
                            {
                                match *action_kind.read() {
                                    Some(FileActionKind::Delete) => rsx! {
                                        p { "Confirm delete this file from GitHub?" }
                                    },
                                    Some(FileActionKind::Rename) => rsx! {
                                        p { "Enter new file name (no extension):" }
                                        input {
                                            value: "{action_input}",
                                            oninput: move |evt| action_input.set(evt.value()),
                                        }
                                    },
                                    Some(FileActionKind::Move) => rsx! {
                                        p { "Enter destination folder path (empty for root):" }
                                        input {
                                            value: "{action_input}",
                                            oninput: move |evt| action_input.set(evt.value()),
                                        }
                                    },
                                    None => rsx! { p { "No action selected." } },
                                }
                            }
                            button { onclick: on_confirm_action, "Confirm" }
                            " "
                            button {
                                onclick: move |_| {
                                    action_file.set(None);
                                    action_kind.set(None);
                                    action_input.set(String::new());
                                },
                                "Cancel"
                            }
                        }
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
                            {
                                let path_for_open = file.path.clone();
                                let path_for_rename = file.path.clone();
                                let path_for_move = file.path.clone();
                                let path_for_delete = file.path.clone();
                                let format_for_open = file.format;
                                let label_path = file.path;
                                let label_size = file.size;
                                let is_favorite = selected_repo_for_history
                                    .read()
                                    .as_ref()
                                    .map(|selection| {
                                        favorites_state
                                            .as_ref()
                                            .and_then(|result| result.as_ref().ok())
                                            .map(|items| {
                                                items.iter().any(|fav| {
                                                    fav.owner == selection.owner
                                                        && fav.repo == selection.repo
                                                        && fav.path == label_path
                                                })
                                            })
                                            .unwrap_or(false)
                                    })
                                    .unwrap_or(false);
                                rsx! {
                                    li { key: "file-{label_path}",
                                        button {
                                            onclick: move |_| {
                                                selected_file.set(Some(path_for_open.clone()));
                                                if let Some(selection) = selected_repo_for_history.read().as_ref() {
                                                    let _ = record_recent_file_open(
                                                        selection.owner.as_str(),
                                                        selection.repo.as_str(),
                                                        path_for_open.as_str(),
                                                        &format_for_open,
                                                    );
                                                }
                                                let next = *recent_history_nonce.read() + 1;
                                                recent_history_nonce.set(next);
                                            },
                                            "{file_badge(&format_for_open)} {label_path} ({human_size(label_size)})"
                                        }
                                        " "
                                        button {
                                            onclick: move |_| {
                                                action_file.set(Some(path_for_rename.clone()));
                                                action_kind.set(Some(FileActionKind::Rename));
                                                action_input.set(
                                                    basename_without_ext(path_for_rename.as_str())
                                                        .unwrap_or_default()
                                                        .to_owned(),
                                                );
                                            },
                                            "Rename"
                                        }
                                        " "
                                        button {
                                            onclick: move |_| {
                                                action_file.set(Some(path_for_move.clone()));
                                                action_kind.set(Some(FileActionKind::Move));
                                                action_input.set(
                                                    parent_dir(path_for_move.as_str())
                                                        .unwrap_or_default()
                                                        .to_owned(),
                                                );
                                            },
                                            "Move"
                                        }
                                        " "
                                        button {
                                            onclick: move |_| {
                                                if let Some(selection) = selected_repo_for_history.read().as_ref() {
                                                    if is_favorite {
                                                        let _ = remove_favorite(
                                                            selection.owner.as_str(),
                                                            selection.repo.as_str(),
                                                            label_path.as_str(),
                                                        );
                                                    } else {
                                                        let _ = add_favorite(
                                                            selection.owner.as_str(),
                                                            selection.repo.as_str(),
                                                            label_path.as_str(),
                                                            &format_for_open,
                                                        );
                                                    }
                                                    let next = *favorites_nonce.read() + 1;
                                                    favorites_nonce.set(next);
                                                }
                                            },
                                            if is_favorite { "Unstar" } else { "Star" }
                                        }
                                        " "
                                        button {
                                            onclick: move |_| {
                                                action_file.set(Some(path_for_delete.clone()));
                                                action_kind.set(Some(FileActionKind::Delete));
                                                action_input.set(String::new());
                                            },
                                            "Delete"
                                        }
                                    }
                                }
                            }
                        }
                    }

                    h3 { "Favorites" }
                    {
                        match favorites_state {
                            Some(Ok(entries)) if entries.is_empty() => rsx! { p { "No favorites yet." } },
                            Some(Ok(entries)) => rsx! {
                                ul {
                                    for entry in entries {
                                        li { key: "fav-{entry.owner}-{entry.repo}-{entry.path}",
                                            button {
                                                onclick: move |_| {
                                                    selected_repo_signal.set(Some(RepositorySelection {
                                                        owner: entry.owner.clone(),
                                                        repo: entry.repo.clone(),
                                                    }));
                                                    selected_file.set(Some(entry.path.clone()));
                                                    open_viewer_in_edit.set(false);
                                                    navigator.push(Route::Viewer {});
                                                },
                                                "{file_badge(&entry.format)} {entry.path} ({entry.owner}/{entry.repo})"
                                            }
                                        }
                                    }
                                }
                            },
                            Some(Err(err)) => rsx! { p { class: "error", "Favorites error: {err}" } },
                            None => rsx! { p { "Loading favorites..." } },
                        }
                    }

                    h3 { "Recently Opened" }
                    {
                        match recent_state {
                            Some(Ok(entries)) if entries.is_empty() => rsx! { p { "No recent files yet." } },
                            Some(Ok(entries)) => rsx! {
                                ul {
                                    for entry in entries {
                                        li { key: "recent-{entry.owner}-{entry.repo}-{entry.path}",
                                            button {
                                                onclick: move |_| {
                                                    selected_repo_signal.set(Some(RepositorySelection {
                                                        owner: entry.owner.clone(),
                                                        repo: entry.repo.clone(),
                                                    }));
                                                    selected_file.set(Some(entry.path.clone()));
                                                    open_viewer_in_edit.set(false);
                                                    navigator.push(Route::Viewer {});
                                                },
                                                "{file_badge(&entry.format)} {entry.path} ({entry.owner}/{entry.repo}) - {format_recent_opened_at(entry.opened_at_unix)}"
                                            }
                                        }
                                    }
                                }
                            },
                            Some(Err(err)) => rsx! { p { class: "error", "Recent history error: {err}" } },
                            None => rsx! { p { "Loading recent history..." } },
                        }
                    }
                }
            }
        }
        Some(Err(err)) => rsx! {
            ErrorBanner { message: format!("Failed to load file tree: {err}") }
            p { "Select a repository in Repos route, then authenticate." }
            button {
                onclick: move |_| {
                    let next = *refresh_nonce.read() + 1;
                    refresh_nonce.set(next);
                },
                "Retry"
            }
        },
        None => rsx! {
            p { "Loading repository tree..." }
            ul {
                li { "Loading folder structure..." }
                li { "Loading notes index..." }
            }
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
    let settings = use_context::<Signal<AppSettings>>();
    let mut open_viewer_in_edit = use_context::<Signal<bool>>();
    let save_status = use_signal(|| None::<String>);
    let mut refresh_nonce = use_signal(|| 0_u32);
    let mut commit_message = use_signal(String::new);
    let mut edit_mode =
        use_signal(|| *open_viewer_in_edit.read() || settings.read().default_editor_mode == "edit");
    let mut draft_content = use_signal(String::new);

    {
        let mut edit_mode = edit_mode;
        use_effect(move || {
            if *open_viewer_in_edit.read() {
                edit_mode.set(true);
                open_viewer_in_edit.set(false);
            }
        });
    }
    let document = use_resource(move || {
        let token = auth_token.read().clone();
        let selection = selected_repo.read().clone();
        let file_path = selected_file.read().clone();
        let nonce = *refresh_nonce.read();
        async move { load_current_file(token, selection, file_path, nonce).await }
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
            let viewer_style = viewer_text_style(
                settings.read().font_size.as_str(),
                settings.read().font_family.as_str(),
                settings.read().theme.as_str(),
            );
            let should_wrap = settings.read().line_wrapping;
            let show_line_numbers = settings.read().show_line_numbers;
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
                            style: "{viewer_style}",
                            wrap: if should_wrap { "soft" } else { "off" },
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
                        if file.path.ends_with(".md") {
                            MarkdownPreview { content: file.content.clone() }
                        } else {
                            if show_line_numbers {
                                pre { style: "{viewer_style}", "{with_line_numbers(file.content.as_str())}" }
                            } else {
                                pre { style: "{viewer_style}", "{file.content}" }
                            }
                        }
                    }
                    button { onclick: on_save, "Save to GitHub" }
                }
            }
        }
        Some(Err(err)) => rsx! {
            ErrorBanner { message: format!("Failed to load file: {err}") }
            p { "Set GITNOTES_FILE_PATH, select repository, then authenticate." }
            button {
                onclick: move |_| {
                    let next = *refresh_nonce.read() + 1;
                    refresh_nonce.set(next);
                },
                "Retry"
            }
        },
        None => rsx! {
            p { "Rendering document..." }
            p { "[spinner]" }
        },
    };

    rsx! {
        section {
            h2 { "Viewer" }
            p { "Read mode for Org, Neorg, and Markdown documents." }
            button {
                onclick: move |_| {
                    let next = *refresh_nonce.read() + 1;
                    refresh_nonce.set(next);
                },
                "Refresh"
            }
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
    let mut settings = use_context::<Signal<AppSettings>>();
    let history_status = use_signal(|| None::<String>);
    let profile = use_resource(move || {
        let token = auth_token.read().clone();
        async move { load_user_profile(token).await }
    });

    let is_authenticated = auth_token.read().is_some();
    let logout = move |_| {
        let _ = clear_token_secure();
        auth_token.set(None);
    };
    let mut history_status_signal = history_status;
    let clear_history = move |_| match clear_recent_file_history() {
        Ok(_) => history_status_signal.set(Some("Recent history cleared".to_owned())),
        Err(err) => history_status_signal.set(Some(format!("Failed to clear history: {err}"))),
    };
    let cache_size = local_cache_size_bytes();

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

            h3 { "Appearance" }
            p { "Theme" }
            select {
                value: "{settings.read().theme}",
                oninput: move |evt| {
                    settings.with_mut(|s| s.theme = evt.value());
                    let _ = save_settings(settings.read().clone());
                },
                option { value: "system", "System" }
                option { value: "light", "Light" }
                option { value: "dark", "Dark" }
            }
            p { "Font Size" }
            select {
                value: "{settings.read().font_size}",
                oninput: move |evt| {
                    settings.with_mut(|s| s.font_size = evt.value());
                    let _ = save_settings(settings.read().clone());
                },
                option { value: "small", "Small" }
                option { value: "medium", "Medium" }
                option { value: "large", "Large" }
                option { value: "xlarge", "Extra Large" }
            }
            p { "Font Family" }
            select {
                value: "{settings.read().font_family}",
                oninput: move |evt| {
                    settings.with_mut(|s| s.font_family = evt.value());
                    let _ = save_settings(settings.read().clone());
                },
                option { value: "monospace", "Monospace" }
                option { value: "proportional", "Proportional" }
            }
            button {
                onclick: move |_| {
                    settings.with_mut(|s| s.line_wrapping = !s.line_wrapping);
                    let _ = save_settings(settings.read().clone());
                },
                if settings.read().line_wrapping { "Line Wrapping: On" } else { "Line Wrapping: Off" }
            }
            " "
            button {
                onclick: move |_| {
                    settings.with_mut(|s| s.show_line_numbers = !s.show_line_numbers);
                    let _ = save_settings(settings.read().clone());
                },
                if settings.read().show_line_numbers { "Line Numbers: On" } else { "Line Numbers: Off" }
            }

            h3 { "Editing" }
            p { "Default Editor Mode" }
            select {
                value: "{settings.read().default_editor_mode}",
                oninput: move |evt| {
                    settings.with_mut(|s| s.default_editor_mode = evt.value());
                    let _ = save_settings(settings.read().clone());
                },
                option { value: "view", "View" }
                option { value: "edit", "Edit" }
            }
            p { "Default New File Format" }
            select {
                value: "{settings.read().default_new_file_format}",
                oninput: move |evt| {
                    settings.with_mut(|s| s.default_new_file_format = evt.value());
                    let _ = save_settings(settings.read().clone());
                },
                option { value: "org", ".org" }
                option { value: "norg", ".norg" }
                option { value: "md", ".md" }
            }
            p { "Auto-save Interval (seconds, 0 disables)" }
            input {
                value: "{settings.read().auto_save_interval_seconds}",
                oninput: move |evt| {
                    if let Ok(value) = evt.value().parse::<u64>() {
                        settings.with_mut(|s| s.auto_save_interval_seconds = value);
                        let _ = save_settings(settings.read().clone());
                    }
                }
            }

            h3 { "Cache" }
            p { "Cache Size: {human_size(Some(cache_size))}" }
            button { onclick: clear_history, "Clear Recent History" }

            h3 { "Account" }
            if is_authenticated {
                p { "Authentication: active" }
                button { onclick: logout, "Logout" }
                {profile_block}
            } else {
                p { "Authentication: not active" }
            }

            h3 { "About" }
            p { "Version: 0.1.0" }
            p { "Licenses: MIT (workspace package license)" }
            if let Some(status) = history_status.read().as_ref() {
                p { "{status}" }
            }
        }
    }
}

async fn load_repositories(
    session_token: Option<String>,
    _refresh_nonce: u32,
) -> AppResult<RepositoryLoadResult> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    let repositories = client.list_all_user_repositories().await.map_err(|err| err.to_string())?;
    let rate_limit = client.last_rate_limit_info();
    Ok(RepositoryLoadResult { repositories, rate_limit })
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
    _refresh_nonce: u32,
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

async fn create_new_note_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    current_dir: &str,
    file_name: &str,
    format: DocumentFormat,
) -> AppResult<String> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());
    let validated_name = validate_new_file_name(file_name)?;
    let extension = match format {
        DocumentFormat::Markdown => "md",
        DocumentFormat::Org => "org",
        DocumentFormat::Neorg => "norg",
    };
    let file_name = format!("{validated_name}.{extension}");
    let path =
        if current_dir.is_empty() { file_name } else { format!("{current_dir}/{file_name}") };
    let content = template_for_format(&format);

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    client
        .upsert_file(UpsertFileInput {
            owner: selection.owner.as_str(),
            repo: selection.repo.as_str(),
            path: path.as_str(),
            message: &format!("Create {path} from gitnotes"),
            content,
            sha: None,
            branch: Some(git_ref.as_str()),
            committer: None,
        })
        .await
        .map_err(|err| err.to_string())?;

    Ok(path)
}

async fn delete_note_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    path: &str,
) -> AppResult<()> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    let file = client
        .file_content(selection.owner.as_str(), selection.repo.as_str(), path, git_ref.as_str())
        .await
        .map_err(|err| err.to_string())?;

    client
        .delete_file(DeleteFileInput {
            owner: selection.owner.as_str(),
            repo: selection.repo.as_str(),
            path,
            message: &format!("Delete {path} from gitnotes"),
            sha: file.sha.as_str(),
            branch: Some(git_ref.as_str()),
            committer: None,
        })
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

async fn rename_note_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    old_path: &str,
    new_name: &str,
) -> AppResult<String> {
    let base_name = validate_new_file_name(new_name)?;
    let extension = extension_for_path(old_path)
        .ok_or_else(|| "cannot rename file with unknown extension".to_owned())?;
    let parent = parent_dir(old_path).unwrap_or_default();
    let new_path = if parent.is_empty() {
        format!("{base_name}.{extension}")
    } else {
        format!("{parent}/{base_name}.{extension}")
    };
    copy_then_delete_note_file(session_token, selected_repo, old_path, new_path.as_str()).await?;
    Ok(new_path)
}

async fn move_note_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    old_path: &str,
    destination_dir: &str,
) -> AppResult<String> {
    let file_name = file_name_with_extension(old_path)
        .ok_or_else(|| "cannot move file with invalid path".to_owned())?;
    let cleaned = destination_dir.trim().trim_matches('/');
    let new_path =
        if cleaned.is_empty() { file_name.to_owned() } else { format!("{cleaned}/{file_name}") };
    copy_then_delete_note_file(session_token, selected_repo, old_path, new_path.as_str()).await?;
    Ok(new_path)
}

async fn copy_then_delete_note_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
    old_path: &str,
    new_path: &str,
) -> AppResult<()> {
    if old_path == new_path {
        return Err("source and destination path are the same".to_owned());
    }

    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());
    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;

    let file = client
        .file_content(selection.owner.as_str(), selection.repo.as_str(), old_path, git_ref.as_str())
        .await
        .map_err(|err| err.to_string())?;

    client
        .upsert_file(UpsertFileInput {
            owner: selection.owner.as_str(),
            repo: selection.repo.as_str(),
            path: new_path,
            message: &format!("Move {old_path} to {new_path} from gitnotes"),
            content: file.content.as_str(),
            sha: None,
            branch: Some(git_ref.as_str()),
            committer: None,
        })
        .await
        .map_err(|err| err.to_string())?;

    client
        .delete_file(DeleteFileInput {
            owner: selection.owner.as_str(),
            repo: selection.repo.as_str(),
            path: old_path,
            message: &format!("Delete {old_path} after move to {new_path} from gitnotes"),
            sha: file.sha.as_str(),
            branch: Some(git_ref.as_str()),
            committer: None,
        })
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

fn markdown_to_html(content: &str, headings: &[MarkdownHeading]) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let with_inline_toc = apply_inline_toc(content, headings);
    let parser = Parser::new_ext(with_inline_toc.as_str(), options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    attach_heading_ids(html_output, headings)
}

fn template_for_format(format: &DocumentFormat) -> &'static str {
    match format {
        DocumentFormat::Markdown => {
            "---\ntitle: New Note\ntags: []\n---\n\n# New Note\n\nCreated by gitnotes.\n"
        }
        DocumentFormat::Org => "#+TITLE: New Note\n\n* New Note\n\nCreated by gitnotes.\n",
        DocumentFormat::Neorg => {
            "@document.meta\ntitle: New Note\ndescription:\n@end\n\n* New Note\n\nCreated by gitnotes.\n"
        }
    }
}

fn parse_note_format(value: &str) -> Option<DocumentFormat> {
    match value {
        "md" => Some(DocumentFormat::Markdown),
        "org" => Some(DocumentFormat::Org),
        "norg" => Some(DocumentFormat::Neorg),
        _ => None,
    }
}

fn validate_new_file_name(input: &str) -> AppResult<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("file name is required".to_owned());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("file name must not include path separators".to_owned());
    }
    if trimmed.contains('.') {
        return Err("file name must not include extension".to_owned());
    }
    if !trimmed.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_') {
        return Err("file name can only include letters, numbers, '-' and '_'".to_owned());
    }
    Ok(trimmed.to_owned())
}

fn parent_dir(path: &str) -> Option<&str> {
    path.rsplit_once('/').map(|(parent, _)| parent)
}

fn file_name_with_extension(path: &str) -> Option<&str> {
    path.rsplit('/').next().filter(|name| !name.is_empty())
}

fn basename_without_ext(path: &str) -> Option<&str> {
    let name = file_name_with_extension(path)?;
    name.rsplit_once('.').map(|(base, _)| base)
}

fn extension_for_path(path: &str) -> Option<&str> {
    let name = file_name_with_extension(path)?;
    name.rsplit_once('.').map(|(_, ext)| ext)
}

fn markdown_headings(content: &str) -> Vec<MarkdownHeading> {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_HEADING_ATTRIBUTES);

    let parser = Parser::new_ext(content, options);
    let mut headings = Vec::new();
    let mut in_heading = false;
    let mut current = String::new();
    let mut level = 1_u8;

    for event in parser {
        match event {
            Event::Start(Tag::Heading { level: heading_level, .. }) => {
                in_heading = true;
                level = heading_level as u8;
                current.clear();
            }
            Event::End(TagEnd::Heading(_)) => {
                let trimmed = current.trim();
                if !trimmed.is_empty() {
                    headings.push(MarkdownHeading {
                        level,
                        text: trimmed.to_owned(),
                        id: heading_id(trimmed),
                    });
                }
                in_heading = false;
                current.clear();
            }
            Event::Text(text) if in_heading => {
                current.push_str(text.as_ref());
            }
            _ => {}
        }
    }

    headings
}

fn heading_id(text: &str) -> String {
    let mut out = String::new();
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if (ch.is_ascii_whitespace() || ch == '-' || ch == '_') && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_matches('-').to_owned()
}

fn apply_inline_toc(content: &str, headings: &[MarkdownHeading]) -> String {
    if !content.contains("[TOC]") {
        return content.to_owned();
    }

    let mut toc = String::new();
    for heading in headings {
        let indent = "  ".repeat(heading.level.saturating_sub(1) as usize);
        toc.push_str(format!("{indent}- [{}](#{})\n", heading.text, heading.id).as_str());
    }
    content.replace("[TOC]", toc.as_str())
}

fn attach_heading_ids(mut html_output: String, headings: &[MarkdownHeading]) -> String {
    for heading in headings {
        let open_tag = format!("<h{}>", heading.level);
        let replacement = format!("<h{} id=\"{}\">", heading.level, heading.id);
        html_output = replace_first(&html_output, open_tag.as_str(), replacement.as_str());
    }
    html_output
}

fn replace_first(haystack: &str, needle: &str, replacement: &str) -> String {
    if let Some(index) = haystack.find(needle) {
        let mut out = String::new();
        out.push_str(&haystack[..index]);
        out.push_str(replacement);
        out.push_str(&haystack[index + needle.len()..]);
        return out;
    }
    haystack.to_owned()
}

async fn load_recent_file_history(_nonce: u32) -> AppResult<Vec<RecentFileEntry>> {
    recent_file_history(20)
}

async fn load_favorites(_nonce: u32) -> AppResult<Vec<FavoriteFileEntry>> {
    favorite_file_list()
}

fn history_db_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_owned());
    PathBuf::from(home).join(".gitnotes-history.db")
}

fn settings_file_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_owned());
    PathBuf::from(home).join(".gitnotes-settings.json")
}

fn load_settings() -> Option<AppSettings> {
    let raw = fs::read_to_string(settings_file_path()).ok()?;
    serde_json::from_str::<AppSettings>(raw.as_str()).ok()
}

fn save_settings(settings: AppSettings) -> AppResult<()> {
    let serialized = serde_json::to_string_pretty(&settings).map_err(|err| err.to_string())?;
    fs::write(settings_file_path(), serialized).map_err(|err| err.to_string())
}

fn theme_class(theme: &str) -> &'static str {
    match theme {
        "light" => "theme-light",
        "dark" => "theme-dark",
        _ => "theme-system",
    }
}

fn effective_theme(theme: &str) -> &'static str {
    match theme {
        "dark" => "dark",
        "light" => "light",
        _ => system_theme_preference(),
    }
}

fn system_theme_preference() -> &'static str {
    if let Ok(value) = std::env::var("GITNOTES_SYSTEM_THEME") {
        return if value.eq_ignore_ascii_case("dark") { "dark" } else { "light" };
    }

    if let Ok(colorfgbg) = std::env::var("COLORFGBG")
        && let Some(bg_raw) = colorfgbg.split(';').next_back()
        && let Ok(bg) = bg_raw.parse::<u8>()
    {
        return if bg <= 7 { "dark" } else { "light" };
    }

    "light"
}

fn app_theme_style(theme: &str) -> String {
    if effective_theme(theme) == "dark" {
        "background: #0f1115; color: #e8eaf0; min-height: 100vh;".to_owned()
    } else {
        "background: #f8fafc; color: #1f2937; min-height: 100vh;".to_owned()
    }
}

fn viewer_text_style(font_size: &str, font_family: &str, theme: &str) -> String {
    let size = match font_size {
        "small" => "12px",
        "large" => "18px",
        "xlarge" => "22px",
        _ => "15px",
    };
    let family = if font_family == "proportional" {
        "ui-serif, Georgia, serif"
    } else {
        "ui-monospace, SFMono-Regular, Menlo, monospace"
    };
    let (fg, bg) = if effective_theme(theme) == "dark" {
        ("#e8eaf0", "#171a21")
    } else {
        ("#111827", "#ffffff")
    };
    format!("font-size: {size}; font-family: {family}; color: {fg}; background: {bg};")
}

fn with_line_numbers(content: &str) -> String {
    content
        .lines()
        .enumerate()
        .map(|(index, line)| format!("{:4} | {line}", index + 1))
        .collect::<Vec<String>>()
        .join("\n")
}

fn local_cache_size_bytes() -> u64 {
    let history_size = fs::metadata(history_db_path()).map(|m| m.len()).unwrap_or(0);
    let session_size = fs::metadata(session_file_path()).map(|m| m.len()).unwrap_or(0);
    history_size + session_size
}

fn history_connection() -> AppResult<Connection> {
    let connection = Connection::open(history_db_path()).map_err(|err| err.to_string())?;
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS recent_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                path TEXT NOT NULL,
                format TEXT NOT NULL,
                opened_at_unix INTEGER NOT NULL,
                UNIQUE(owner, repo, path)
            )",
            [],
        )
        .map_err(|err| err.to_string())?;
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner TEXT NOT NULL,
                repo TEXT NOT NULL,
                path TEXT NOT NULL,
                format TEXT NOT NULL,
                UNIQUE(owner, repo, path)
            )",
            [],
        )
        .map_err(|err| err.to_string())?;
    Ok(connection)
}

fn add_favorite(owner: &str, repo: &str, path: &str, format: &DocumentFormat) -> AppResult<()> {
    let connection = history_connection()?;
    connection
        .execute(
            "INSERT OR REPLACE INTO favorites (owner, repo, path, format) VALUES (?1, ?2, ?3, ?4)",
            params![owner, repo, path, format_to_code(format)],
        )
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn remove_favorite(owner: &str, repo: &str, path: &str) -> AppResult<()> {
    let connection = history_connection()?;
    connection
        .execute(
            "DELETE FROM favorites WHERE owner = ?1 AND repo = ?2 AND path = ?3",
            params![owner, repo, path],
        )
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn favorite_file_list() -> AppResult<Vec<FavoriteFileEntry>> {
    let connection = history_connection()?;
    let mut stmt = connection
        .prepare("SELECT owner, repo, path, format FROM favorites ORDER BY owner, repo, path")
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let format_code: String = row.get(3)?;
            let format =
                parse_note_format(format_code.as_str()).unwrap_or(DocumentFormat::Markdown);
            Ok(FavoriteFileEntry {
                owner: row.get(0)?,
                repo: row.get(1)?,
                path: row.get(2)?,
                format,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|err| err.to_string())?);
    }
    Ok(entries)
}

fn record_recent_file_open(
    owner: &str,
    repo: &str,
    path: &str,
    format: &DocumentFormat,
) -> AppResult<()> {
    let connection = history_connection()?;
    let format_code = format_to_code(format);
    let opened_at_unix = unix_ts();
    connection
        .execute(
            "DELETE FROM recent_files WHERE owner = ?1 AND repo = ?2 AND path = ?3",
            params![owner, repo, path],
        )
        .map_err(|err| err.to_string())?;
    connection
        .execute(
            "INSERT INTO recent_files (owner, repo, path, format, opened_at_unix) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![owner, repo, path, format_code, opened_at_unix],
        )
        .map_err(|err| err.to_string())?;
    connection
        .execute(
            "DELETE FROM recent_files
             WHERE id NOT IN (
                SELECT id FROM recent_files
                ORDER BY opened_at_unix DESC
                LIMIT 20
             )",
            [],
        )
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn recent_file_history(limit: usize) -> AppResult<Vec<RecentFileEntry>> {
    let connection = history_connection()?;
    let mut stmt = connection
        .prepare(
            "SELECT owner, repo, path, format, opened_at_unix
             FROM recent_files
             ORDER BY opened_at_unix DESC
             LIMIT ?1",
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map(params![limit as i64], |row| {
            let format_code: String = row.get(3)?;
            let format =
                parse_note_format(format_code.as_str()).unwrap_or(DocumentFormat::Markdown);
            Ok(RecentFileEntry {
                owner: row.get(0)?,
                repo: row.get(1)?,
                path: row.get(2)?,
                format,
                opened_at_unix: row.get(4)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|err| err.to_string())?);
    }
    Ok(entries)
}

fn clear_recent_file_history() -> AppResult<()> {
    let connection = history_connection()?;
    connection.execute("DELETE FROM recent_files", []).map_err(|err| err.to_string())?;
    Ok(())
}

fn format_to_code(format: &DocumentFormat) -> &'static str {
    match format {
        DocumentFormat::Markdown => "md",
        DocumentFormat::Org => "org",
        DocumentFormat::Neorg => "norg",
    }
}

fn format_recent_opened_at(opened_at_unix: i64) -> String {
    if let Some(dt) = chrono::DateTime::from_timestamp(opened_at_unix, 0) {
        dt.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M").to_string()
    } else {
        "unknown time".to_owned()
    }
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

fn repo_history_file_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_owned());
    PathBuf::from(home).join(".gitnotes-recent-repos.json")
}

fn load_recent_repos() -> Vec<RepositorySelection> {
    let path = repo_history_file_path();
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<RepositorySelection>>(raw.as_str()).unwrap_or_default()
}

fn remember_recent_repo(selection: &RepositorySelection) {
    let mut repos = load_recent_repos();
    repos.retain(|repo| repo.owner != selection.owner || repo.repo != selection.repo);
    repos.insert(0, selection.clone());
    repos.truncate(10);
    if let Ok(serialized) = serde_json::to_string(&repos) {
        let _ = fs::write(repo_history_file_path(), serialized);
    }
}

fn parse_repo_selection(value: &str) -> Option<RepositorySelection> {
    let (owner, repo) = value.split_once('/')?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(RepositorySelection { owner: owner.to_owned(), repo: repo.to_owned() })
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

fn unix_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}
