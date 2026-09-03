//! UniFFI-exported facade types.
//!
//! `types` holds the wire types (serde for the JS bridge, `uniffi` derives
//! where a type crosses the FFI boundary); `bridge` is the exported facade
//! bound by the host Expo module.

pub mod bridge;
pub mod types;

pub use types::*;

/// Engine version string exposed through the facade.
pub fn version() -> &'static str {
    crate::version()
}
