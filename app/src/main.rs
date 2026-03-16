use dioxus::prelude::*;
use dioxus_router::prelude::*;
use gn_github::{DeviceCodeResponse, GitHubClient, GitHubOAuthDeviceClient, GitHubRepository};

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
    let repos = use_resource(move || {
        let token = auth_token.read().clone();
        async move { load_repositories(token).await }
    });

    let content = match &*repos.read() {
        Some(Ok(items)) if items.is_empty() => rsx! {
            p { "No repositories found for this account." }
        },
        Some(Ok(items)) => rsx! {
            ul {
                for repo in items {
                    li { key: "{repo.id}",
                        strong { "{repo.full_name}" }
                        " "
                        span { "(default: {repo.default_branch})" }
                    }
                }
            }
        },
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
            {content}
        }
    }
}

#[component]
fn Files() -> Element {
    rsx! {
        section {
            h2 { "File Browser" }
            p { "This screen will show filtered .org, .norg, and .md files." }
        }
    }
}

#[component]
fn Viewer() -> Element {
    rsx! {
        section {
            h2 { "Viewer" }
            p { "Read mode for Org, Neorg, and Markdown documents." }
        }
    }
}

#[component]
fn Settings() -> Element {
    rsx! {
        section {
            h2 { "Settings" }
            p { "Theme, caching, and account controls will live here." }
        }
    }
}

async fn load_repositories(session_token: Option<String>) -> Result<Vec<GitHubRepository>, String> {
    let token = match session_token {
        Some(value) if !value.trim().is_empty() => value,
        _ => std::env::var("GITNOTES_GITHUB_TOKEN").map_err(|_| {
            "missing auth token (login first or set GITNOTES_GITHUB_TOKEN)".to_owned()
        })?,
    };

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    client.list_user_repositories(1, 50).await.map_err(|err| err.to_string())
}
