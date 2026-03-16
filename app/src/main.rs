use dioxus::prelude::*;
use dioxus_router::prelude::*;
use gn_github::{GitHubClient, GitHubRepository};

#[derive(Clone, Debug, PartialEq, Routable)]
enum Route {
    #[route("/")]
    Home {},
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
    rsx! {
        div { class: "app-shell",
            h1 { "gitnotes" }
            p { "Mobile-first notes app for .org, .norg, and .md backed by GitHub." }
            nav { class: "top-nav",
                Link { to: Route::Home {}, "Home" }
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
    rsx! {
        section {
            h2 { "Welcome" }
            p { "Foundation scaffold is running with Dioxus routing." }
            ul {
                li { "Auth and repo browser are next." }
                li { "Parsers are scaffolded in workspace crates." }
                li { "Viewer and editor routes are ready for implementation." }
            }
        }
    }
}

#[component]
fn Repos() -> Element {
    let repos = use_resource(move || async move { load_repositories().await });

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
            p { "Set GITNOTES_GITHUB_TOKEN in your environment to load repositories." }
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

async fn load_repositories() -> Result<Vec<GitHubRepository>, String> {
    let token = std::env::var("GITNOTES_GITHUB_TOKEN")
        .map_err(|_| "missing GITNOTES_GITHUB_TOKEN".to_owned())?;

    let client = GitHubClient::new(token).map_err(|err| err.to_string())?;
    client.list_user_repositories(1, 50).await.map_err(|err| err.to_string())
}
