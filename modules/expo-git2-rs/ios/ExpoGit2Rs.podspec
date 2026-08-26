# frozen_string_literal: true

Pod::Specification.new do |s|
  s.name             = 'ExpoGit2Rs'
  s.version          = '0.1.0'
  s.summary          = 'Native Git operations via git2-rs for Expo'
  s.description      = 'Native Git operations via git2-rs for Expo/React Native iOS'
  s.homepage         = 'https://github.com/gedwolmen/gitnotes'
  s.license         = { :type => 'GPL-3.0', :file => '../LICENSE' }
  s.author           = { 'GitNotēs Contributors' => 'https://github.com/gedwolmen/gitnotes' }
  s.source           = { :git => 'https://github.com/gedwolmen/gitnotes.git', :tag => s.version.to_s }
  s.platform         = :ios, '14.0'

  s.source_files     = '*.{swift,m,h}'

  s.public_header_files = '*.h'

  s.pod_target_xcconfig = {
    'BUILD_LIBRARY_FOR_DISTRIBUTION' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'OTHER_LDFLAGS' => '-lexpo_git2_rs -lgit2 -lssl -lcrypto -lz',
    'RUST_LIBRARY_PATH' => '../rust/target/universal/apple/ios/release',
  }

  s.dependency 'ExpoModulesCore'

  s.vendored_libraries = '../rust/target/universal/apple/ios/release/libexpo_git2_rs.a'
end
