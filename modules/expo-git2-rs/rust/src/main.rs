/*!
 * expo-git2-rs CLI entry point (development/testing only)
 *
 * The actual native module is used via FFI from Swift (iOS) and Kotlin/JNI (Android).
 */

fn main() {
    println!(
        "expo-git2-rs v{} — native module, not a CLI tool",
        env!("CARGO_PKG_VERSION")
    );
    println!("Use via Expo native module FFI, not directly.");
}
