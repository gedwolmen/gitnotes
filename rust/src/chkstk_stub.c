// Stub for ___chkstk_darwin — satisfies linker on iOS arm64.
// The macOS x86_64 clang compiler emits calls to this for stack safety checking,
// but the iOS arm64 SDK doesn't provide it. This no-op stub lets the linker resolve it.
__attribute__((visibility("default"))) void ___chkstk_darwin(void) {}
