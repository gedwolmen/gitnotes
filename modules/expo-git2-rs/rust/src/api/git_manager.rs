/*!
 * GitManager — top-level git operation entry point.
 *
 * This is a placeholder scaffold. Full implementation in Todo 7.
 *
 * GPL-3.0 derivative of GitSync.
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum GitOperationRequest {
    GetVersion,
    IsRepository { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "ok", rename_all = "camelCase", content = "data")]
pub enum GitOperationResult {
    GetVersion { version: String },
    IsRepository { exists: bool },
}

#[no_mangle]
pub extern "C" fn git_manager_version() -> *mut std::os::raw::c_char {
    let version = format!("expo-git2-rs {}", env!("CARGO_PKG_VERSION"));
    let c_str = std::ffi::CString::new(version).unwrap();
    std::mem::ManuallyDrop::new(c_str.into_raw()) as *mut std::os::raw::c_char
}

#[no_mangle]
pub extern "C" fn git_manager_execute(
    _req: *const std::os::raw::c_char,
) -> *mut std::os::raw::c_char {
    let result = r#"{"ok":"GetVersion","data":{"version":"0.1.0-git2-rs-husk"}}"#;
    let c_str = std::ffi::CString::new(result).unwrap();
    std::mem::ManuallyDrop::new(c_str.into_raw()) as *mut std::os::raw::c_char
}

#[no_mangle]
pub extern "C" fn git_manager_free(ptr: *mut std::os::raw::c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        std::ffi::CString::from_raw(ptr);
    }
}
