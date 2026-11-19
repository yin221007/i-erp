package cn.i2000.ierp.ui

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

internal object NativeDownloadPolicy {
    const val MAX_DOWNLOAD_BYTES = 256L * 1024L * 1024L
    const val MAX_BASE64_CHUNK_CHARS = 70_000

    private val invalidFileNameCharacters = Regex("[\\\\/:*?\"<>|\\p{Cc}]")
    private val validMimeType = Regex("^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$")
    private val validDownloadId = Regex("^[A-Za-z0-9_-]{1,80}$")

    fun safeFileName(value: String): String {
        val baseName = value
            .replace('\\', '/')
            .substringAfterLast('/')
            .replace(invalidFileNameCharacters, "_")
            .trim()
            .trim('.')
            .take(180)
        return baseName.ifBlank { "iERP-download" }
    }

    fun safeMimeType(value: String): String =
        value.substringBefore(';').trim().takeIf { it.length <= 120 && validMimeType.matches(it) }
            ?: "application/octet-stream"

    fun isValidDownloadId(value: String): Boolean = validDownloadId.matches(value)
}

internal class NativeDownloadBridge(private val context: Context) {
    private data class ActiveDownload(
        val uri: Uri?,
        val file: File?,
        val output: OutputStream,
        val expectedBytes: Long,
        var writtenBytes: Long = 0
    )

    private val activeDownloads = ConcurrentHashMap<String, ActiveDownload>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var isClosed = false
    // WebView exposes the interface to every frame. Only the trusted top-level page receives this token.
    val pageToken: UUID = UUID.randomUUID()

    @JavascriptInterface
    @Synchronized
    fun begin(token: String, id: String, fileName: String, mimeType: String, expectedSize: String): Boolean {
        if (isClosed || token != pageToken.toString()) return false
        if (!NativeDownloadPolicy.isValidDownloadId(id)) return false
        val expectedBytes = expectedSize.toLongOrNull() ?: return false
        if (expectedBytes !in 0..NativeDownloadPolicy.MAX_DOWNLOAD_BYTES) return false
        removeDownload(id)

        return runCatching {
            val target = createTarget(
                NativeDownloadPolicy.safeFileName(fileName),
                NativeDownloadPolicy.safeMimeType(mimeType),
                expectedBytes
            )
            activeDownloads[id] = target
            true
        }.getOrElse {
            showToast("无法创建下载文件")
            false
        }
    }

    @JavascriptInterface
    fun append(token: String, id: String, base64Chunk: String): Boolean {
        if (token != pageToken.toString()) return false
        if (base64Chunk.length > NativeDownloadPolicy.MAX_BASE64_CHUNK_CHARS) {
            abortWithError(id)
            return false
        }
        val download = activeDownloads[id] ?: return false
        return runCatching {
            val bytes = Base64.decode(base64Chunk, Base64.NO_WRAP)
            synchronized(download) {
                val nextSize = download.writtenBytes + bytes.size
                check(nextSize <= download.expectedBytes)
                download.output.write(bytes)
                download.writtenBytes = nextSize
            }
            true
        }.getOrElse {
            abortWithError(id)
            false
        }
    }

    @JavascriptInterface
    fun finish(token: String, id: String): Boolean {
        if (token != pageToken.toString()) return false
        val download = activeDownloads.remove(id) ?: return false
        return runCatching {
            synchronized(download) {
                check(download.writtenBytes == download.expectedBytes)
                download.output.flush()
                download.output.close()
                publish(download)
            }
            showToast("文件已保存到下载/iERP")
            true
        }.getOrElse {
            cleanup(download)
            showToast("下载失败，请稍后重试")
            false
        }
    }

    @JavascriptInterface
    fun abort(token: String, id: String) {
        if (token == pageToken.toString()) removeDownload(id)
    }

    private fun removeDownload(id: String) {
        activeDownloads.remove(id)?.let(::cleanup)
    }

    @Synchronized
    fun abortAll() {
        isClosed = true
        activeDownloads.keys.toList().forEach(::removeDownload)
    }

    private fun createTarget(fileName: String, mimeType: String, expectedBytes: Long): ActiveDownload {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                put(MediaStore.Downloads.MIME_TYPE, mimeType)
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/iERP")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = checkNotNull(
                context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            )
            val output = try {
                checkNotNull(context.contentResolver.openOutputStream(uri, "w"))
            } catch (error: Throwable) {
                runCatching { context.contentResolver.delete(uri, null, null) }
                throw error
            }
            return ActiveDownload(uri = uri, file = null, output = output, expectedBytes = expectedBytes)
        }

        val directory = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "iERP").apply {
            check(exists() || mkdirs())
        }
        val file = uniqueFile(directory, fileName)
        return ActiveDownload(
            uri = null,
            file = file,
            output = FileOutputStream(file),
            expectedBytes = expectedBytes
        )
    }

    private fun publish(download: ActiveDownload) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && download.uri != null) {
            val values = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
            check(context.contentResolver.update(download.uri, values, null, null) == 1)
        }
    }

    private fun cleanup(download: ActiveDownload) {
        synchronized(download) {
            runCatching { download.output.close() }
            download.uri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
            download.file?.let { runCatching { it.delete() } }
        }
    }

    private fun abortWithError(id: String) {
        removeDownload(id)
        showToast("下载失败，请稍后重试")
    }

    private fun showToast(message: String) {
        mainHandler.post { Toast.makeText(context, message, Toast.LENGTH_LONG).show() }
    }

    private fun uniqueFile(directory: File, requestedName: String): File {
        val initial = File(directory, requestedName)
        if (!initial.exists()) return initial
        val extension = requestedName.substringAfterLast('.', "")
        val stem = if (extension.isEmpty()) requestedName else requestedName.dropLast(extension.length + 1)
        for (index in 1..999) {
            val suffix = if (extension.isEmpty()) " ($index)" else " ($index).$extension"
            val candidate = File(directory, "$stem$suffix")
            if (!candidate.exists()) return candidate
        }
        return File(directory, "$stem-${System.currentTimeMillis()}${if (extension.isEmpty()) "" else ".$extension"}")
    }
}
