use dioxus::prelude::*;
use dioxus_router::prelude::*;

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
    rsx! {
        section {
            h2 { "Repositories" }
            p { "This screen will list GitHub repositories and allow selection." }
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
