package com.tgcloud.tgdrive

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread

/**
 * `window.TGAndroid` bridge for what the WebView cannot reach: system pickers
 * with persistent permission (SAF), downloads folder, opening and sharing
 * files, and the transfer service.
 *
 * Asynchronous calls receive a `req` and reply through `window.__tgReply(req, json)`.
 */
class AndroidBridge(private val activity: MainActivity, private val webView: WebView) {
  private val resolver get() = activity.contentResolver

  private fun reply(req: Int, json: String?) {
    val payload = JSONObject.quote(json ?: "null")
    activity.runOnUiThread {
      webView.evaluateJavascript("window.__tgReply && window.__tgReply($req, $payload)", null)
    }
  }

  private fun persist(uri: Uri, write: Boolean) {
    val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or (if (write) Intent.FLAG_GRANT_WRITE_URI_PERMISSION else 0)
    try {
      resolver.takePersistableUriPermission(uri, flags)
    } catch (_: SecurityException) {
      // Provider does not offer persistent permission: valid while the app lives.
    }
  }

  /** Name, size and type of a document. */
  fun describe(uri: Uri, path: String): JSONObject {
    var name = uri.lastPathSegment ?: "arquivo"
    var size = 0L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        c.getString(0)?.let { name = it }
        if (!c.isNull(1)) size = c.getLong(1)
      }
    }
    return JSONObject()
      .put("uri", uri.toString())
      .put("name", name)
      .put("size", size)
      .put("mime", resolver.getType(uri) ?: "")
      .put("path", path)
  }

  @JavascriptInterface
  fun pickFiles(req: Int) {
    activity.runOnUiThread {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
      activity.launchActivityForResult(intent) { result ->
        val data = result?.data
        thread {
          val uris = mutableListOf<Uri>()
          data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
          if (uris.isEmpty()) data?.data?.let { uris.add(it) }
          val out = JSONArray()
          for (u in uris) {
            persist(u, false)
            out.put(describe(u, ""))
          }
          reply(req, out.toString())
        }
      }
    }
  }

  /** Whole folder: returns every file with the relative path (including the folder itself). */
  @JavascriptInterface
  fun pickFolder(req: Int) {
    activity.runOnUiThread {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
      activity.launchActivityForResult(intent) { result ->
        val tree = result?.data?.data
        thread {
          if (tree == null) return@thread reply(req, "[]")
          persist(tree, false)
          val out = JSONArray()
          val rootId = DocumentsContract.getTreeDocumentId(tree)
          val rootName = nameOf(tree, rootId) ?: "Pasta"
          walk(tree, rootId, rootName, out)
          reply(req, out.toString())
        }
      }
    }
  }

  private fun nameOf(tree: Uri, docId: String): String? {
    val uri = DocumentsContract.buildDocumentUriUsingTree(tree, docId)
    resolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) return c.getString(0)
    }
    return null
  }

  private fun walk(tree: Uri, docId: String, path: String, out: JSONArray) {
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId)
    val cols = arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
      DocumentsContract.Document.COLUMN_SIZE,
    )
    resolver.query(children, cols, null, null, null)?.use { c ->
      while (c.moveToNext()) {
        val id = c.getString(0)
        val name = c.getString(1) ?: continue
        val mime = c.getString(2) ?: ""
        if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
          walk(tree, id, "$path/$name", out)
        } else {
          out.put(
            JSONObject()
              .put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString())
              .put("name", name)
              .put("size", if (c.isNull(3)) 0 else c.getLong(3))
              .put("mime", mime)
              .put("path", path)
          )
        }
      }
    }
  }

  /** Downloads folder, chosen once (persistent write permission). */
  @JavascriptInterface
  fun pickDownloadTree(req: Int) {
    activity.runOnUiThread {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
        // Opens in Download: Android does not accept its root, but creating
        // "Download/TGDrive" is one tap away.
        if (Build.VERSION.SDK_INT >= 26) {
          putExtra(
            DocumentsContract.EXTRA_INITIAL_URI,
            DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Download")
          )
        }
        addFlags(
          Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        )
      }
      activity.launchActivityForResult(intent) { result ->
        val tree = result?.data?.data
        thread {
          if (tree == null) return@thread reply(req, "null")
          persist(tree, true)
          val name = nameOf(tree, DocumentsContract.getTreeDocumentId(tree)) ?: "Downloads"
          reply(req, JSONObject().put("uri", tree.toString()).put("name", name).toString())
        }
      }
    }
  }

  @JavascriptInterface
  fun treeValid(uri: String): Boolean =
    resolver.persistedUriPermissions.any { it.uri.toString() == uri && it.isWritePermission }

  /** Creates (or finds) the folders of `dir` inside the tree and a new document for `name`. */
  @JavascriptInterface
  fun createDocument(tree: String, dir: String, name: String, mime: String): String {
    return try {
      val treeUri = Uri.parse(tree)
      var parent = DocumentsContract.buildDocumentUriUsingTree(treeUri, DocumentsContract.getTreeDocumentId(treeUri))
      for (seg in dir.split('/').filter { it.isNotEmpty() }) {
        parent = findChild(treeUri, parent, seg)
          ?: DocumentsContract.createDocument(resolver, parent, DocumentsContract.Document.MIME_TYPE_DIR, seg)
          ?: return JSONObject().put("error", "FILE_CREATE_FAILED: pasta $seg").toString()
      }
      val doc = DocumentsContract.createDocument(resolver, parent, mime.ifEmpty { "application/octet-stream" }, name)
        ?: return JSONObject().put("error", "FILE_CREATE_FAILED: $name").toString()
      JSONObject().put("uri", doc.toString()).toString()
    } catch (e: Exception) {
      JSONObject().put("error", e.message ?: e.toString()).toString()
    }
  }

  private fun findChild(tree: Uri, parent: Uri, name: String): Uri? {
    val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(parent))
    val cols = arrayOf(
      DocumentsContract.Document.COLUMN_DOCUMENT_ID,
      DocumentsContract.Document.COLUMN_DISPLAY_NAME,
      DocumentsContract.Document.COLUMN_MIME_TYPE,
    )
    resolver.query(children, cols, null, null, null)?.use { c ->
      while (c.moveToNext()) {
        if (c.getString(1) == name && c.getString(2) == DocumentsContract.Document.MIME_TYPE_DIR) {
          return DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0))
        }
      }
    }
    return null
  }

  @JavascriptInterface
  fun openUri(uri: String, mime: String): Boolean {
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(Uri.parse(uri), mime.ifEmpty { "*/*" })
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return try {
      activity.startActivity(intent)
      true
    } catch (_: ActivityNotFoundException) {
      false
    }
  }

  /** Shares a file from the app cache (prepared by Rust). */
  @JavascriptInterface
  fun shareFile(path: String, mime: String, name: String): Boolean {
    return try {
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", File(path))
      val send = Intent(Intent.ACTION_SEND).apply {
        type = mime.ifEmpty { "application/octet-stream" }
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TITLE, name)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(send, name).apply {
        // TGDrive itself does not appear as a target.
        putExtra(Intent.EXTRA_EXCLUDE_COMPONENTS, arrayOf(android.content.ComponentName(activity, MainActivity::class.java)))
      }
      activity.runOnUiThread { activity.startActivity(chooser) }
      true
    } catch (e: Exception) {
      false
    }
  }

  /** Starts the foreground service (idempotent). It shuts itself down when there are no transfers. */
  @JavascriptInterface
  fun startTransfers(port: Int) {
    activity.runOnUiThread {
      val start = {
        val intent = Intent(activity, TransferService::class.java).putExtra("port", port)
        ContextCompat.startForegroundService(activity, intent)
      }
      if (Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
        !activity.askedNotifications
      ) {
        activity.askedNotifications = true
        // Without the permission the service runs anyway; only the notification is missing.
        activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS)) { start() }
      } else {
        start()
      }
    }
  }

  /** Items received through "Share → TGDrive" not yet handled. */
  @JavascriptInterface
  fun takeShared(): String = activity.takeShared()

  // ---- update ------------------------------------------------------------------------

  private val updates by lazy { com.google.android.play.core.appupdate.AppUpdateManagerFactory.create(activity) }

  /** Who installed it: "play" (Play Store) or "other" (GitHub release APK, adb). */
  @JavascriptInterface
  fun installSource(): String {
    val pm = activity.packageManager
    val installer = try {
      if (Build.VERSION.SDK_INT >= 30) pm.getInstallSourceInfo(activity.packageName).installingPackageName
      else @Suppress("DEPRECATION") pm.getInstallerPackageName(activity.packageName)
    } catch (_: Exception) {
      null
    }
    return if (installer == "com.android.vending") "play" else "other"
  }

  /** Play: is there a new version? Replies `{available, version}` (versionCode). */
  @JavascriptInterface
  fun playUpdate(req: Int) {
    activity.runOnUiThread {
      updates.appUpdateInfo
        .addOnSuccessListener { info ->
          val ok = info.updateAvailability() == com.google.android.play.core.install.model.UpdateAvailability.UPDATE_AVAILABLE &&
            info.isUpdateTypeAllowed(com.google.android.play.core.install.model.AppUpdateType.IMMEDIATE)
          reply(req, JSONObject().put("available", ok).put("version", info.availableVersionCode()).toString())
        }
        .addOnFailureListener { reply(req, JSONObject().put("available", false).toString()) }
    }
  }

  /** Play: Play's own update flow (or the app page, if it refuses). */
  @JavascriptInterface
  fun playUpdateStart() {
    activity.runOnUiThread {
      updates.appUpdateInfo
        .addOnSuccessListener { info ->
          try {
            updates.startUpdateFlow(
              info,
              activity,
              com.google.android.play.core.appupdate.AppUpdateOptions.defaultOptions(com.google.android.play.core.install.model.AppUpdateType.IMMEDIATE),
            )
          } catch (_: Exception) {
            openLink("market://details?id=${activity.packageName}")
          }
        }
        .addOnFailureListener { openLink("market://details?id=${activity.packageName}") }
    }
  }

  /** External link (GitHub release page, Play Store). */
  @JavascriptInterface
  fun openLink(url: String): Boolean = try {
    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (_: ActivityNotFoundException) {
    false
  }

  // ---- downloads into the app default folder (no folder picking) ----------------------
  //
  // Like Google Photos (DCIM/Restored) and Drive: the file is born in the
  // MediaStore, pending (other apps do not see it half-written); Rust writes by
  // address and `finishMedia` publishes it at the end. Android < 10: a plain file in
  // the folder, announced to the system at the end.

  private fun canWriteLegacy() = Build.VERSION.SDK_INT >= 29 ||
    ContextCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

  /** Creates `dir/name` (dir relative to storage: "DCIM/Restored", "Download/TGDrive/Folder"). Replies `{uri}` or `{error}`. */
  @JavascriptInterface
  fun createMedia(req: Int, dir: String, name: String, mime: String) {
    val rel = dir.split('/').filter { it.isNotBlank() }.joinToString("/")
    val type = mime.ifEmpty { "application/octet-stream" }
    val fail = { e: Exception -> reply(req, JSONObject().put("error", e.message ?: e.toString()).toString()) }
    if (Build.VERSION.SDK_INT >= 29) {
      thread {
        try {
          val col = when {
            rel == "Download" || rel.startsWith("Download/") -> android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI
            type.startsWith("image/") -> android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            type.startsWith("video/") -> android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            type.startsWith("audio/") -> android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            else -> android.provider.MediaStore.Files.getContentUri("external")
          }
          val values = android.content.ContentValues().apply {
            put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(android.provider.MediaStore.MediaColumns.MIME_TYPE, type)
            put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, "$rel/")
            put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
          }
          val uri = resolver.insert(col, values) ?: throw java.io.IOException("SYSTEM_REJECTED_FILE")
          reply(req, JSONObject().put("uri", uri.toString()).toString())
        } catch (e: Exception) {
          fail(e)
        }
      }
      return
    }
    val create = {
      thread {
        try {
          @Suppress("DEPRECATION")
          val folder = File(android.os.Environment.getExternalStorageDirectory(), rel).apply { mkdirs() }
          var file = File(folder, name)
          var n = 1
          val base = name.substringBeforeLast('.')
          val ext = name.substringAfterLast('.', "")
          while (file.exists()) file = File(folder, if (ext.isEmpty()) "$base (${n++})" else "$base (${n++}).$ext")
          file.createNewFile()
          reply(req, JSONObject().put("uri", Uri.fromFile(file).toString()).toString())
        } catch (e: Exception) {
          fail(e)
        }
      }
    }
    if (canWriteLegacy()) create()
    else activity.runOnUiThread {
      activity.requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
        if (canWriteLegacy()) create() else reply(req, JSONObject().put("error", "NO_PERMISSION_SAVE").toString())
      }
    }
  }

  /** Download finished: it shows up in the gallery and other apps. */
  @JavascriptInterface
  fun finishMedia(uri: String) {
    thread {
      try {
        val u = Uri.parse(uri)
        if (u.scheme == "file") {
          android.media.MediaScannerConnection.scanFile(activity, arrayOf(u.path), null, null)
        } else if (Build.VERSION.SDK_INT >= 29 && u.authority == "media") {
          resolver.update(u, android.content.ContentValues().apply { put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        }
      } catch (_: Exception) {
      }
    }
  }
}
