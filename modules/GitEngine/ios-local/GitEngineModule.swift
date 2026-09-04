import ExpoModulesCore
import Foundation

public final class GitEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GitEngine")

    Function("discardFiles") { (path: String, paths: [String]) in
      try discardFiles(path: path, paths: paths)
    }

    Function("engineName") { () -> String in
      return "git2 (via UniFFI)"
    }

    Function("version") { () -> String in
      return "0.1.0"
    }
  }
}
