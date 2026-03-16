use dioxus::prelude::*;
use dioxus_router::prelude::*;
use gn_github::{
    DeviceCodeResponse, FileContent, GitHubClient, GitHubOAuthDeviceClient, GitHubRepository,
    UpsertFileInput, UserProfile,
};

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
    tracing_subscriber::fmt::init();
    launch(App);
}

#[component]
fn App() -> Element {
    use_context_provider(|| Signal::new(None::<String>));
    use_context_provider(|| Signal::new(None::<RepositorySelection>));

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

#[derive(Clone, Debug, PartialEq, Eq)]
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
                        auth_token.set(Some(token.access_token));
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
    let refresh_nonce = use_signal(|| 0_u32);

    let repos = use_resource(move || {
        let token = auth_token.read().clone();
        let nonce = *refresh_nonce.read();
        async move { load_repositories(token, nonce).await }
    });

    let repos_state = repos.read().clone();
    let content = match repos_state {
        Some(Ok(items)) if items.is_empty() => rsx! {
            p { "No repositories found for this account." }
        },
        Some(Ok(items)) => {
            let mut selected_repo = selected_repo;
            rsx! {
                ul {
                    for repo in items {
                        li { key: "{repo.id}",
                            strong { "{repo.full_name}" }
                            " "
                            span { "(default: {repo.default_branch})" }
                            " "
                            button {
                                onclick: move |_| {
                                    let mut parts = repo.full_name.split('/');
                                    let owner = parts.next().unwrap_or_default().to_owned();
                                    let name = parts.next().unwrap_or_default().to_owned();
                                    if !owner.is_empty() && !name.is_empty() {
                                        selected_repo.set(Some(RepositorySelection { owner, repo: name }));
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
            p { class: "error", "Failed to load repositories: {err}" }
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
            button {
                onclick: move |_| {
                    let mut nonce = refresh_nonce;
                    nonce += 1;
                },
                "Refresh"
            }
            {content}
        }
    }
}

#[component]
fn Files() -> Element {
    let auth_token = use_context::<Signal<Option<String>>>();
    let selected_repo = use_context::<Signal<Option<RepositorySelection>>>();
    let files = use_resource(move || {
        let token = auth_token.read().clone();
        let selection = selected_repo.read().clone();
        async move { load_note_files(token, selection).await }
    });

    let content = match &*files.read() {
        Some(Ok(items)) if items.is_empty() => rsx! {
            p { "No .org/.norg/.md files found in this repository tree." }
        },
        Some(Ok(items)) => rsx! {
            ul {
                for path in items {
                    li { key: "{path}", "{path}" }
                }
            }
        },
        Some(Err(err)) => rsx! {
            p { class: "error", "Failed to load file tree: {err}" }
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
            {content}
        }
    }
}

#[component]
fn Viewer() -> Element {
    let auth_token = use_context::<Signal<Option<String>>>();
    let selected_repo = use_context::<Signal<Option<RepositorySelection>>>();
    let save_status = use_signal(|| None::<String>);
    let document = use_resource(move || {
        let token = auth_token.read().clone();
        let selection = selected_repo.read().clone();
        async move { load_current_file(token, selection).await }
    });

    let content = match &*document.read() {
        Some(Ok(file)) => {
            let current = file.clone();
            let token_for_save = auth_token.read().clone();
            let selection_for_save = selected_repo.read().clone();
            let mut save_status = save_status;
            let on_save = move |_| {
                let token = token_for_save.clone();
                let selection = selection_for_save.clone();
                let file = current.clone();
                spawn(async move {
                    save_status.set(Some("Saving file to GitHub...".to_owned()));
                    let result = save_current_file(token, selection, &file).await;
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
                    pre { "{file.content}" }
                    button { onclick: on_save, "Save to GitHub" }
                }
            }
        }
        Some(Err(err)) => rsx! {
            p { class: "error", "Failed to load file: {err}" }
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
            p { class: "error", "Profile load failed: {err}" }
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
) -> Result<Vec<GitHubRepository>, String> {
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
) -> Result<Vec<String>, String> {
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

    Ok(GitHubClient::filter_note_blob_paths(&tree.tree))
}

async fn load_current_file(
    session_token: Option<String>,
    selected_repo: Option<RepositorySelection>,
) -> Result<FileContent, String> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());
    let path =
        std::env::var("GITNOTES_FILE_PATH").map_err(|_| "missing GITNOTES_FILE_PATH".to_owned())?;

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
    file: &FileContent,
) -> Result<String, String> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let selection = selected_repo.ok_or_else(|| "no selected repository in session".to_owned())?;
    let git_ref = std::env::var("GITNOTES_REPO_REF").unwrap_or_else(|_| "main".to_owned());

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    let response = client
        .upsert_file(UpsertFileInput {
            owner: selection.owner.as_str(),
            repo: selection.repo.as_str(),
            path: file.path.as_str(),
            message: &format!("Update {} from gitnotes", file.path),
            content: file.content.as_str(),
            sha: Some(file.sha.as_str()),
            branch: Some(git_ref.as_str()),
            committer: None,
        })
        .await
        .map_err(|err| err.to_string())?;

    Ok(response.commit.sha)
}

async fn load_user_profile(session_token: Option<String>) -> Result<UserProfile, String> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    client.user_profile().await.map_err(|err| err.to_string())
}
