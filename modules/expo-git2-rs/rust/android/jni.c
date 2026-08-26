/*
 * JNI bridge — compiled via CMake from Android/Gradle.
 *
 * Bridges Java/JNI ↔ Rust C FFI.
 * Java declares these via ExpoGit2RsBridge.java; this file provides the
 * implementations that are linked into libexpo_git2_rs_jni.so.
 *
 * JNI_OnLoad caches the JVM so we can use FindClass and NewStringUTF
 * from any thread without needing the JNIEnv on the call path.
 */

#include <jni.h>
#include <stdint.h>

/* Rust C FFI (from libexpo_git2_rs static lib, linked by CMake) */
extern char* git_manager_version(void);
extern char* git_manager_execute(const char* req_json);
extern void  git_manager_free(char* ptr);

/* Cached JVM — set by JNI_OnLoad */
static JavaVM* cached_jvm = NULL;

/*
 * JNI_OnLoad — called when the .so containing this code is loaded.
 * This is invoked by the JVM during System.loadLibrary().
 */
JNIEXPORT jint JNICALL
JNI_OnLoad(JavaVM* vm, void* reserved) {
    (void)reserved;
    cached_jvm = vm;
    return JNI_VERSION_1_6;
}

/*
 * Attach current thread to JVM and return JNIEnv*.
 * Returns NULL if attach fails.
 */
static JNIEnv* get_env(void) {
    JNIEnv* env;
    jint rc = (*cached_jvm)->GetEnv(cached_jvm, (void**)&env, JNI_VERSION_1_6);
    if (rc == JNI_OK) return env;
    if ((*cached_jvm)->AttachCurrentThreadAsDaemon(cached_jvm, &env, NULL) == JNI_OK) return env;
    return NULL;
}

/* ─── ExpoGit2RsBridge native methods ────────────────────────────────── */

JNIEXPORT jlong JNICALL
Java_com_gitnotes_expo_git2rs_ExpoGit2RsBridge_nativeVersion(JNIEnv* env, jclass cls) {
    (void)env;
    (void)cls;
    return (jlong)(uintptr_t)git_manager_version();
}

JNIEXPORT jlong JNICALL
Java_com_gitnotes_expo_git2rs_ExpoGit2RsBridge_nativeExecute(JNIEnv* env, jclass cls, jstring requestJson) {
    (void)cls;
    /* JNI converts Kotlin String to UTF-8 C string */
    const char* req_cstr = (*env)->GetStringUTFChars(env, requestJson, NULL);
    if (req_cstr == NULL) return 0; /* OOM already thrown */
    char* result = git_manager_execute(req_cstr);
    (*env)->ReleaseStringUTFChars(env, requestJson, req_cstr);
    return (jlong)(uintptr_t)result;
}

JNIEXPORT void JNICALL
Java_com_gitnotes_expo_git2rs_ExpoGit2RsBridge_nativeFree(JNIEnv* env, jclass cls, jlong ptr) {
    (void)env;
    (void)cls;
    if (ptr != 0) {
        git_manager_free((char*)(uintptr_t)ptr);
    }
}

JNIEXPORT jstring JNICALL
Java_com_gitnotes_expo_git2rs_ExpoGit2RsBridge_nativeToJavaString(JNIEnv* env, jclass cls, jlong rustPtr) {
    (void)cls;
    if (rustPtr == 0) return NULL;
    const char* cstr = (const char*)(uintptr_t)rustPtr;
    return (*env)->NewStringUTF(env, cstr);
}
