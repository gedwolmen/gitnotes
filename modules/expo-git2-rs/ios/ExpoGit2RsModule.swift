/*!
 * ExpoGit2RsModule — Swift adapter for expo-git2-rs
 *
 * Bridges the Rust static library to Expo AsyncFunction and progress events.
 *
 * GPL-3.0 derivative of GitSync.
 */

import Foundation
import ExpoModulesCore

// Rust libgit2 exports *mut c_char — use UnsafeMutablePointer to match
@_silgen_name("git_manager_version")
func git_manager_version() -> UnsafeMutablePointer<CChar>

@_silgen_name("git_manager_execute")
func git_manager_execute(_ req: UnsafeMutablePointer<CChar>) -> UnsafeMutablePointer<CChar>

@_silgen_name("git_manager_free")
func git_manager_free(_ ptr: UnsafeMutablePointer<CChar>)

public class ExpoGit2RsModule: Module {
  public func definition() -> ModuleDefinition {
    return ModuleDefinition(name: "ExpoGit2RsModule") {
      // Asynchronous function: execute
      AsyncFunction("execute") { (json: String) -> String in
        let reqCStr = json.withCString { cStr -> UnsafePointer<CChar> in
          return strdup(cStr)
        }
        defer { free(reqCStr) }

        let resultPtr = git_manager_execute(reqCStr)
        defer { git_manager_free(resultPtr) }

        let result = String(cString: resultPtr)
        return result
      }

      // Asynchronous function: getVersion
      AsyncFunction("getVersion") { () -> String in
        let versionPtr = git_manager_version()
        defer { git_manager_free(versionPtr) }
        return String(cString: versionPtr)
      }

      // Asynchronous function: isRepository
      AsyncFunction("isRepository") { (path: String) -> Bool in
        // Delegate to Rust via execute
        let req = #"{"op":"isRepository","path":"\#(path)"}"#
        let resultJson = try await self.executeSync(req)
        // Parse result for now, just check path existence
        return FileManager.default.fileExists(atPath: path)
      }
    }
  }

  private func executeSync(_ json: String) async throws -> String {
    let reqCStr = json.withCString { cStr -> UnsafePointer<CChar> in
      return strdup(cStr)
    }
    defer { free(reqCStr) }

    let resultPtr = git_manager_execute(reqCStr)
    defer { git_manager_free(resultPtr) }

    return String(cString: resultPtr)
  }
}
