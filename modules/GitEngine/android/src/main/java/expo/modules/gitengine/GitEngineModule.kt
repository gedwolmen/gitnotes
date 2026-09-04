// allow: SIZE_OK — complete Android mirror of ios-local/GitEngineModule.swift; the two
// files expose the same JS surface and must be kept in sync method-for-method.
package expo.modules.gitengine

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import uniffi.gitnotes_git2.*

internal class GitEngineException(message: String) : CodedException(message)

class GitEngineModule : Module() {
  private var engineLoadError: Throwable? = null

  private fun ensureEngineLoaded() {
    val error = engineLoadError ?: return
    throw GitEngineException(
      "GitEngine native library unavailable: ${error.message ?: error}. " +
        "Run `yarn build:rust --android` and rebuild the app."
    )
  }

  private fun <T> engineOp(block: () -> T): T {
    ensureEngineLoaded()
    return try {
      block()
    } catch (error: BridgeException) {
      throw GitEngineException(bridgeErrorText(error))
    }
  }

  private fun bridgeErrorText(error: BridgeException): String = when (error) {
    is BridgeException.Git -> "git error: ${error.errorMessage}"
    is BridgeException.Io -> "io error: ${error.errorMessage}"
    is BridgeException.Invalid -> "invalid input: ${error.errorMessage}"
    is BridgeException.Busy -> "repository is busy: ${error.errorMessage}"
    is BridgeException.NotARepository -> "not a git repository: ${error.path}"
    is BridgeException.Unsupported -> "operation not supported: ${error.errorMessage}"
    is BridgeException.Other -> error.errorMessage
  }

  // Forwards Rust progress events to JS from the engine's worker thread
  // (sendEvent dispatches onto the JS queue internally).
  private fun progressForwarder(): ProgressListener = object : ProgressListener {
    override fun onProgress(event: ProgressEvent) {
      val payload = progressPayload(event)
      sendEvent("onCloneProgress", payload)
      sendEvent("onEngineProgress", payload)
    }
  }

  private fun credentialSourceFromJs(dict: Map<String, Any?>): CredentialSource? {
    return when (dict["kind"] as? String) {
      "userpass" -> CredentialSource.UserPass(
        username = dict["username"] as? String ?: "git",
        password = dict["password"] as? String ?: "",
      )
      "ssh" -> CredentialSource.SshKey(
        username = dict["username"] as? String ?: "git",
        privateKey = dict["privateKey"] as? String ?: "",
        publicKey = dict["publicKey"] as? String,
        passphrase = dict["passphrase"] as? String,
      )
      "default" -> CredentialSource.Default
      "none" -> CredentialSource.None
      else -> null
    }
  }

  private fun credentialToJs(source: CredentialSource): Map<String, Any?> = when (source) {
    is CredentialSource.None -> mapOf("kind" to "none")
    is CredentialSource.UserPass -> mapOf(
      "kind" to "userpass",
      "username" to source.username,
      "password" to source.password,
    )
    is CredentialSource.SshKey -> mapOf(
      "kind" to "ssh",
      "username" to source.username,
      "privateKey" to source.privateKey,
      "publicKey" to source.publicKey,
      "passphrase" to source.passphrase,
    )
    is CredentialSource.Default -> mapOf("kind" to "default")
  }

  private fun hunksFromJs(hunks: List<Map<String, Any?>>): List<HunkSelection> = hunks.map { hunk ->
    val indices = (hunk["lineIndices"] as? List<*>)
      ?.mapNotNull { (it as? Number)?.toInt()?.toUInt() }
      ?: emptyList()
    HunkSelection(indices)
  }

  override fun definition() = ModuleDefinition {
    Name("GitEngine")

    Events("onCloneProgress", "onEngineProgress")

    OnCreate {
      engineLoadError = try {
        System.loadLibrary("gitnotes_git2")
        uniffiEnsureInitialized()
        null
      } catch (error: UnsatisfiedLinkError) {
        error
      } catch (error: Exception) {
        error
      }
    }

    AsyncFunction("version") Coroutine { ->
      engineOp { version() }
    }

    AsyncFunction("engineName") Coroutine { ->
      engineOp { engineName() }
    }

    AsyncFunction("isRepoLocked") Coroutine { path: String ->
      engineOp { isRepoLocked(fsPath(path)) }
    }

    AsyncFunction("setCredential") Coroutine { repoId: String, credential: Map<String, Any?> ->
      engineOp {
        val source = credentialSourceFromJs(credential)
          ?: throw GitEngineException("invalid credential shape")
        setCredential(repoId, source)
      }
    }

    AsyncFunction("getCredential") Coroutine { repoId: String ->
      engineOp { getCredential(repoId)?.let(::credentialToJs) }
    }

    AsyncFunction("clearCredential") Coroutine { repoId: String ->
      engineOp { clearCredential(repoId) }
    }

    AsyncFunction("generateSshKey") Coroutine { passphrase: String? ->
      engineOp {
        val key = generateSshKey(passphrase)
        mapOf("publicKey" to key.publicKey, "privateKey" to key.privateKey)
      }
    }

    AsyncFunction("clone") Coroutine { url: String, dest: String, repoId: String? ->
      engineOp { cloneRepoWithProgress(url, fsPath(dest), repoId, null, progressForwarder()) }
    }

    AsyncFunction("removeRepo") Coroutine { path: String ->
      engineOp { removeRepo(fsPath(path)) }
    }

    AsyncFunction("initRepo") Coroutine { path: String, bare: Boolean ->
      engineOp { initRepo(fsPath(path), bare) }
    }

    AsyncFunction("repoStatus") Coroutine { repoId: String, path: String ->
      engineOp { statusDict(repoStatus(repoId, fsPath(path))) }
    }

    AsyncFunction("listStatuses") Coroutine { path: String ->
      engineOp { listStatuses(fsPath(path)).map(::fileStatusDict) }
    }

    AsyncFunction("diffAll") Coroutine { path: String ->
      engineOp { diffAll(fsPath(path)).map(::fileDiffDict) }
    }

    AsyncFunction("diffFile") Coroutine { path: String, filePath: String ->
      engineOp { fileDiffDict(diffFile(fsPath(path), filePath)) }
    }

    AsyncFunction("stagePaths") Coroutine { path: String, paths: List<String> ->
      engineOp { stagePaths(fsPath(path), paths) }
    }

    AsyncFunction("unstagePaths") Coroutine { path: String, paths: List<String> ->
      engineOp { unstagePaths(fsPath(path), paths) }
    }

    AsyncFunction("removePaths") Coroutine { path: String, paths: List<String>, keepWorktree: Boolean ->
      engineOp { removePaths(fsPath(path), paths, keepWorktree) }
    }

    AsyncFunction("discardFiles") Coroutine { path: String, paths: List<String> ->
      engineOp { discardFiles(fsPath(path), paths) }
    }

    AsyncFunction("stageFileLines") Coroutine { path: String, filePath: String, hunks: List<Map<String, Any?>> ->
      engineOp { stageFileLines(fsPath(path), filePath, hunksFromJs(hunks)) }
    }

    AsyncFunction("commit") Coroutine { path: String, message: String, authorName: String, authorEmail: String ->
      engineOp { commitDict(commitChanges(fsPath(path), message, Author(authorName, authorEmail))) }
    }

    AsyncFunction("recentCommits") Coroutine { path: String, limit: Int ->
      engineOp { recentCommits(fsPath(path), limit.toUInt()).map(::commitDict) }
    }

    AsyncFunction("commitDiff") Coroutine { path: String, commitId: String ->
      engineOp { commitDiff(fsPath(path), commitId).map(::fileDiffDict) }
    }

    AsyncFunction("checkoutCommit") Coroutine { path: String, commitId: String ->
      engineOp { checkoutCommit(fsPath(path), commitId) }
    }

    AsyncFunction("resetSoft") Coroutine { path: String, commitId: String ->
      engineOp { resetSoft(fsPath(path), commitId) }
    }

    AsyncFunction("revertCommit") Coroutine { path: String, commitId: String, authorName: String, authorEmail: String ->
      engineOp { commitDict(revertCommit(fsPath(path), commitId, Author(authorName, authorEmail))) }
    }

    AsyncFunction("getConflicts") Coroutine { path: String ->
      engineOp { getConflicts(fsPath(path)).map(::conflictDict) }
    }

    AsyncFunction("resolveConflict") Coroutine { path: String, filePath: String ->
      engineOp { resolveConflict(fsPath(path), filePath) }
    }

    AsyncFunction("getConflictBlobs") Coroutine { path: String, filePath: String ->
      engineOp { conflictBlobsDict(getConflictBlobs(fsPath(path), filePath)) }
    }

    AsyncFunction("markConflictResolved") Coroutine { path: String, filePath: String ->
      engineOp { markConflictResolved(fsPath(path), filePath) }
    }

    AsyncFunction("fetch") Coroutine { path: String, remoteName: String, repoId: String? ->
      engineOp { fetchRepoWithProgress(fsPath(path), remoteName, repoId, null, progressForwarder()) }
    }

    AsyncFunction("pull") Coroutine { path: String, remoteName: String, repoId: String? ->
      engineOp { pullDict(pullRepo(fsPath(path), remoteName, repoId, null, progressForwarder())) }
    }

    AsyncFunction("push") Coroutine { path: String, remoteName: String, repoId: String?, force: Boolean ->
      engineOp { pushDict(pushRepo(fsPath(path), remoteName, repoId, null, force, progressForwarder())) }
    }

    AsyncFunction("pushWithIntegrate") Coroutine { path: String, remoteName: String, repoId: String? ->
      engineOp {
        pushIntegrateDict(pushRepoWithIntegrate(fsPath(path), remoteName, repoId, null, progressForwarder()))
      }
    }

    AsyncFunction("listBranches") Coroutine { path: String, remoteName: String ->
      engineOp { listBranches(fsPath(path), remoteName).map(::branchDict) }
    }

    AsyncFunction("createBranch") Coroutine { path: String, name: String, source: String? ->
      engineOp { branchDict(createBranch(fsPath(path), name, source)) }
    }

    AsyncFunction("checkoutBranch") Coroutine { path: String, name: String, remoteName: String ->
      engineOp { checkoutBranch(fsPath(path), name, remoteName) }
    }

    AsyncFunction("deleteBranch") Coroutine { path: String, name: String ->
      engineOp { deleteBranch(fsPath(path), name) }
    }

    AsyncFunction("renameBranch") Coroutine { path: String, name: String, newName: String ->
      engineOp { branchDict(renameBranch(fsPath(path), name, newName)) }
    }

    AsyncFunction("listRemotes") Coroutine { path: String ->
      engineOp { listRemotes(fsPath(path)).map(::remoteDict) }
    }

    AsyncFunction("addRemote") Coroutine { path: String, name: String, url: String ->
      engineOp { addRemote(fsPath(path), name, url) }
    }

    AsyncFunction("removeRemote") Coroutine { path: String, name: String ->
      engineOp { removeRemote(fsPath(path), name) }
    }

    AsyncFunction("setRemoteUrl") Coroutine { path: String, name: String, url: String ->
      engineOp { setRemoteUrl(fsPath(path), name, url) }
    }

    AsyncFunction("repoInfo") Coroutine { path: String ->
      engineOp { repoInfoDict(repoInfo(fsPath(path))) }
    }

    AsyncFunction("repairRepo") Coroutine { path: String ->
      engineOp { repairDict(repairRepo(fsPath(path))) }
    }

    AsyncFunction("backupCorruptRepo") Coroutine { path: String ->
      engineOp { backupCorruptRepo(fsPath(path)) }
    }
  }
}
