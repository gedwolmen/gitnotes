/*!
 * GitManager — top-level FFI entry point.
 *
 * Dispatches versioned JSON requests to operation handlers.
 * All handles are opened and dropped inside each call.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::{branch, clone, commit, diff, fetch, log, merge, pull, push, remote, status, tag};
use crate::error::GitError;
use crate::protocol::{CredRequest, GitProgress};

// Progress callback registry — per-call closure stored temporarily
static PROGRESS_CALLBACK: std::sync::LazyLock<
    std::sync::Mutex<Option<Box<dyn Fn(GitProgress) + Send + Sync>>>,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(None));

fn set_progress_callback<F>(cb: F)
where
    F: Fn(GitProgress) + Send + Sync + 'static,
{
    if let Ok(mut guard) = PROGRESS_CALLBACK.lock() {
        *guard = Some(Box::new(cb));
    }
}

fn clear_progress_callback() {
    if let Ok(mut guard) = PROGRESS_CALLBACK.lock() {
        *guard = None;
    }
}

fn send_progress(p: GitProgress) {
    if let Ok(guard) = PROGRESS_CALLBACK.lock() {
        if let Some(ref cb) = *guard {
            cb(p);
        }
    }
}

/// Get version string.
#[no_mangle]
pub extern "C" fn git_manager_version() -> *mut std::os::raw::c_char {
    let version = format!("expo-git2-rs {} protocol 1", env!("CARGO_PKG_VERSION"));
    let c_str = std::ffi::CString::new(version).unwrap();
    c_str.into_raw() as *mut std::os::raw::c_char
}

/// Execute a JSON-encoded operation request.
#[no_mangle]
pub extern "C" fn git_manager_execute(
    req: *const std::os::raw::c_char,
) -> *mut std::os::raw::c_char {
    if req.is_null() {
        return json_error(&GitError::InternalError {
            reason: "null request".to_string(),
        });
    }

    let req_cstr = unsafe { std::ffi::CStr::from_ptr(req) };
    let req_str = match req_cstr.to_str() {
        Ok(s) => s,
        Err(_) => {
            return json_error(&GitError::InvalidOperation {
                reason: "invalid UTF-8 in request".to_string(),
            });
        }
    };

    let result = execute_inner(req_str);

    clear_progress_callback();

    match result {
        Ok(json) => {
            let c_str = std::ffi::CString::new(json).unwrap();
            c_str.into_raw() as *mut std::os::raw::c_char
        }
        Err(e) => json_error(&e),
    }
}

fn json_error(e: &GitError) -> *mut std::os::raw::c_char {
    let error_json = e.to_json();
    let json = format!(r#"{{"ok":false,"error":{}}}"#, error_json);
    let c_str = std::ffi::CString::new(json).unwrap();
    c_str.into_raw() as *mut std::os::raw::c_char
}

// ─── Request / operation deserialization ───────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum Op {
    #[serde(rename = "getVersion")]
    GetVersion,
    Clone(CloneOp),
    Fetch(FetchOp),
    Push(PushOp),
    Pull(PullOp),
    Stage(StageOp),
    Commit(CommitOp),
    Status(StatusOp),
    Log(LogOp),
    DiffFile(DiffFileOp),
    DiffCommit(DiffCommitOp),
    ListBranches(ListBranchesOp),
    CreateBranch(CreateBranchOp),
    CheckoutBranch(CheckoutBranchOp),
    DeleteBranch(DeleteBranchOp),
    ListTags(ListTagsOp),
    CreateTag(CreateTagOp),
    DeleteTag(DeleteTagOp),
    ListRemotes(ListRemotesOp),
    AddRemote(AddRemoteOp),
    RemoveRemote(RemoveRemoteOp),
    SetRemoteUrl(SetRemoteUrlOp),
    MergeAnalysis(MergeAnalysisOp),
    Merge(MergeOp),
    ResolveConflict(ResolveConflictOp),
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloneOp {
    url: String,
    path: String,
    cred: Option<CredRequest>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FetchOp {
    path: String,
    remote: String,
    cred: Option<CredRequest>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushOp {
    path: String,
    remote: String,
    refspec: String,
    cred: Option<CredRequest>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullOp {
    path: String,
    remote: String,
    #[serde(default)]
    refspec: Option<String>,
    cred: Option<CredRequest>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StageOp {
    path: String,
    file_path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitOp {
    path: String,
    message: String,
    author_name: String,
    author_email: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusOp {
    path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogOp {
    path: String,
    #[serde(default)]
    max_count: Option<usize>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiffFileOp {
    path: String,
    commit_oid: String,
    file_path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiffCommitOp {
    path: String,
    commit_oid: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListBranchesOp {
    path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBranchOp {
    path: String,
    branch_name: String,
    commit_oid: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckoutBranchOp {
    path: String,
    branch_name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteBranchOp {
    path: String,
    branch_name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListTagsOp {
    path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTagOp {
    path: String,
    tag_name: String,
    target_oid: String,
    #[serde(default)]
    message: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteTagOp {
    path: String,
    tag_name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListRemotesOp {
    path: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddRemoteOp {
    path: String,
    name: String,
    url: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveRemoteOp {
    path: String,
    name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetRemoteUrlOp {
    path: String,
    name: String,
    url: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MergeAnalysisOp {
    path: String,
    branch: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MergeOp {
    path: String,
    branch: String,
    #[serde(default)]
    message: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolveConflictOp {
    path: String,
    file_path: String,
    resolution: String,
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

fn execute_inner(req_str: &str) -> Result<String, GitError> {
    let op: Op = serde_json::from_str(req_str)
        .map_err(|e| GitError::InvalidOperation {
            reason: format!("parse error: {}", e),
        })?;

    match op {
        Op::GetVersion => Ok(serde_json::json!({
            "ok": true,
            "version": format!("expo-git2-rs {}", env!("CARGO_PKG_VERSION")),
            "protocol": "1",
        }).to_string()),

        Op::Clone(op) => {
            let result = clone::clone_repository(&op.url, &op.path, op.cred, &send_progress)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::Fetch(op) => {
            let result = fetch::fetch(&op.path, &op.remote, op.cred, &send_progress)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::Push(op) => {
            let result = push::push(&op.path, &op.remote, &op.refspec, op.cred, &send_progress)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::Pull(op) => {
            let result = pull::pull(&op.path, &op.remote, op.refspec.as_deref(), op.cred, &send_progress)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::Stage(op) => {
            let result = commit::stage_file(&op.path, &op.file_path)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::Commit(op) => {
            let result = commit::commit(&op.path, &op.message, &op.author_name, &op.author_email)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::Status(op) => {
            let result = status::status(&op.path)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::Log(op) => {
            let result = log::log(&op.path, op.max_count)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::DiffFile(op) => {
            let result = diff::diff_file(&op.path, &op.commit_oid, &op.file_path)?;
            Ok(serde_json::json!({ "ok": true, "data": { "content": result } }).to_string())
        }
        Op::DiffCommit(op) => {
            let result = diff::diff_commit(&op.path, &op.commit_oid)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::ListBranches(op) => {
            let result = branch::list_branches(&op.path)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::CreateBranch(op) => {
            let result = branch::create_branch(&op.path, &op.branch_name, &op.commit_oid)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::CheckoutBranch(op) => {
            branch::checkout_branch(&op.path, &op.branch_name)?;
            Ok(serde_json::json!({ "ok": true, "data": { "branch": op.branch_name } }).to_string())
        }
        Op::DeleteBranch(op) => {
            branch::delete_branch(&op.path, &op.branch_name)?;
            Ok(serde_json::json!({ "ok": true, "data": { "branch": op.branch_name } }).to_string())
        }
        Op::ListTags(op) => {
            let result = tag::list_tags(&op.path)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::CreateTag(op) => {
            let result = tag::create_tag(&op.path, &op.tag_name, &op.target_oid, op.message.as_deref())?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::DeleteTag(op) => {
            tag::delete_tag(&op.path, &op.tag_name)?;
            Ok(serde_json::json!({ "ok": true, "data": { "tag": op.tag_name } }).to_string())
        }
        Op::ListRemotes(op) => {
            let result = remote::list_remotes(&op.path)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::AddRemote(op) => {
            remote::add_remote(&op.path, &op.name, &op.url)?;
            Ok(serde_json::json!({ "ok": true, "data": { "name": op.name } }).to_string())
        }
        Op::RemoveRemote(op) => {
            remote::remove_remote(&op.path, &op.name)?;
            Ok(serde_json::json!({ "ok": true, "data": { "name": op.name } }).to_string())
        }
        Op::SetRemoteUrl(op) => {
            remote::set_remote_url(&op.path, &op.name, &op.url)?;
            Ok(serde_json::json!({ "ok": true, "data": { "name": op.name } }).to_string())
        }
        Op::MergeAnalysis(op) => {
            let result = merge::merge_analysis(&op.path, &op.branch)?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::Merge(op) => {
            let result = merge::merge(&op.path, &op.branch, op.message.as_deref())?;
            Ok(serde_json::json!({ "ok": true, "data": result }).to_string())
        }
        Op::ResolveConflict(op) => {
            let resolution = match op.resolution.as_str() {
                "accept_ours" => merge::ConflictResolution::AcceptOurs,
                "accept_theirs" => merge::ConflictResolution::AcceptTheirs,
                "use_both" => merge::ConflictResolution::UseBoth,
                _ => {
                    return Err(GitError::InvalidOperation {
                        reason: format!("unknown resolution: {}", op.resolution),
                    });
                }
            };
            merge::resolve_conflict(&op.path, &op.file_path, resolution)?;
            Ok(serde_json::json!({ "ok": true, "data": { "path": op.file_path } }).to_string())
        }
    }
}

/// Free a string allocated by this library.
#[no_mangle]
pub extern "C" fn git_manager_free(ptr: *mut std::os::raw::c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        std::ffi::CString::from_raw(ptr);
    }
}
