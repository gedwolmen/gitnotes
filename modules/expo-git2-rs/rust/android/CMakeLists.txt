cmake_minimum_required(VERSION 3.22.1)

project(expo_git2_rs_android LANGUAGES C)

# Find Android NDK variables
if(NOT ANDROID_NDK)
    message(FATAL_ERROR "ANDROID_NDK not set — this CMake file must be built via Gradle with NDK")
endif()

# JNI headers from NDK
include_directories(${ANDROID_NDK}/sources/android/cpufeatures)
include_directories(${ANDROID_NDK}/toolchains/llvm/prebuilt/${ANDROID_NDK_TOOLCHAIN_DIR}/sysroot)

# JNI header path — includes jni.h
set(JNI_INCLUDE_DIRS
    ${ANDROID_NDK}/toolchains/llvm/prebuilt/${ANDROID_NDK_TOOLCHAIN_DIR}/sysroot/usr/include
    ${ANDROID_NDK}/toolchains/llvm/prebuilt/${ANDROID_NDK_TOOLCHAIN_DIR}/sysroot/usr/include/jni.h
)

# Source files
set(RUST_LIB_PATH ${CMAKE_CURRENT_SOURCE_DIR}/../../../target/${ANDROID_ABI}/libexpo_git2_rs.a)
set(JNI_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/jni.c)

# Verify rust library exists
if(NOT EXISTS ${RUST_LIB_PATH})
    message(FATAL_ERROR "Rust library not found: ${RUST_LIB_PATH}\n"
        "Run: cd ../../../ && cargo build --release --target ${ANDROID_ABI}")
endif()

# Create static library target from pre-built Rust artifact
add_library(expo_git2_rs_static STATIC IMPORTED GLOBAL)
set_target_properties(expo_git2_rs_static PROPERTIES
    IMPORTED_LOCATION ${RUST_LIB_PATH}
)

# Compile JNI shim
add_library(expo_git2_rs_jni SHARED ${JNI_SOURCES})
target_include_directories(expo_git2_rs_jni PRIVATE ${JNI_INCLUDE_DIRS})
target_link_libraries(expo_git2_rs_jni
    expo_git2_rs_static
    log
)
