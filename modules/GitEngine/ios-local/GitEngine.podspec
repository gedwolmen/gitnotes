Pod::Spec.new do |s|
  s.name         = 'GitEngine'
  s.version      = '0.1.0'
  s.summary      = 'Expo native module for GitEngine Rust bindings'
  s.homepage    = 'https://github.com/gedwolmen/gitnotes'
  s.license      = { :type => 'MIT' }
  s.author       = { 'GitNotes' => 'dev@gitnotes.app' }
  s.source       = { :path => '.' }
  s.platform     = :ios, '16.4'

  # Expo native module + UniFFI generated Swift FFI + FFI header
  s.source_files = '*.swift', 'generated/*.swift', 'generated/GitNotesGit2FFI/GitNotesGit2FFI.h'
  s.pod_target_xcconfig = {
    'MODULEMAP_FILE' => '../../modules/GitEngine/ios-local/generated/GitNotesGit2FFI/module.modulemap',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) ${PODS_TARGET_SRCROOT}/generated',
  }

  # Rust staticlib (vendored)
  s.vendored_libraries = 'rust/*.a'

  # System libraries needed by Rust git2
  s.libraries = 'iconv'

  # Dependencies
  s.dependency 'ExpoModulesCore'

  s.swift_version = '5.0'
end
