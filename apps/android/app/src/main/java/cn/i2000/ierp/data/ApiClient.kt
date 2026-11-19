package cn.i2000.ierp.data

import android.content.SharedPreferences
import java.io.IOException
import java.io.File
import java.io.RandomAccessFile
import java.net.SocketTimeoutException
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.RequestBody.Companion.asRequestBody

interface CookieStore {
    fun save(url: HttpUrl, cookies: List<Cookie>)
    fun load(url: HttpUrl): List<Cookie>
    fun clear()
    fun cookies(): List<Cookie>
}

class InMemoryCookieStore : CookieStore {
    private val values = linkedMapOf<String, Cookie>()

    override fun save(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { cookie ->
            val key = "${cookie.domain}|${cookie.path}|${cookie.name}"
            if (cookie.expiresAt <= System.currentTimeMillis()) values.remove(key) else values[key] = cookie
        }
    }

    override fun load(url: HttpUrl): List<Cookie> =
        values.values.filter { it.expiresAt > System.currentTimeMillis() && it.matches(url) }

    override fun clear() = values.clear()

    override fun cookies(): List<Cookie> = values.values.toList()
}

/** Stores only server cookies. Passwords and response bodies never enter preferences. */
class PersistentCookieStore(private val preferences: SharedPreferences) : CookieStore {
    private val memory = InMemoryCookieStore()
    private val key = "server_cookies_v1"

    init {
        preferences.getStringSet(key, emptySet()).orEmpty().forEach { encoded ->
            runCatching {
                val decoded = String(Base64.getDecoder().decode(encoded), Charsets.UTF_8)
                val parts = decoded.split('\t')
                val scheme = parts[0]
                val domain = parts[1]
                val url = "$scheme://$domain/".toHttpUrl()
                val builder = Cookie.Builder()
                    .name(parts[3])
                    .value(parts[4])
                    .path(parts[2])
                    .expiresAt(parts[5].toLong())
                if (parts[8].toBoolean()) builder.hostOnlyDomain(domain) else builder.domain(domain)
                if (parts[6].toBoolean()) builder.secure()
                if (parts[7].toBoolean()) builder.httpOnly()
                memory.save(url, listOf(builder.build()))
            }
        }
    }

    override fun save(url: HttpUrl, cookies: List<Cookie>) {
        memory.save(url, cookies)
        persist(url)
    }

    override fun load(url: HttpUrl): List<Cookie> = memory.load(url)

    override fun clear() {
        memory.clear()
        preferences.edit().remove(key).apply()
    }

    override fun cookies(): List<Cookie> = memory.cookies()

    private fun persist(url: HttpUrl) {
        val values = memory.cookies().map { cookie ->
            val raw = listOf(
                url.scheme,
                cookie.domain,
                cookie.path,
                cookie.name,
                cookie.value,
                cookie.expiresAt.toString(),
                cookie.secure.toString(),
                cookie.httpOnly.toString(),
                cookie.hostOnly.toString()
            ).joinToString("\t")
            Base64.getEncoder().encodeToString(raw.toByteArray(Charsets.UTF_8))
        }.toSet()
        preferences.edit().putStringSet(key, values).apply()
    }
}

class ApiException(message: String, val statusCode: Int? = null) : IOException(message)

class ApiClient(
    baseUrl: String,
    private val origin: String,
    private val cookieStore: CookieStore,
    client: OkHttpClient? = null
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val root = baseUrl.trimEnd('/') + "/"
    private val http = client ?: OkHttpClient.Builder()
        .cookieJar(object : CookieJar {
            override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = cookieStore.save(url, cookies)
            override fun loadForRequest(url: HttpUrl): List<Cookie> = cookieStore.load(url)
        })
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    suspend fun login(username: String, password: String): IERPUser {
        val body = json.encodeToString(LoginRequest(username, password, persistent = true))
        val response = execute("auth/login", "POST", body)
        return json.decodeFromString<LoginResponse>(response).user
    }

    suspend fun currentUser(): IERPUser =
        json.decodeFromString<CurrentUserResponse>(execute("auth/me")).user

    suspend fun updateCurrentUser(preferences: JsonObject): IERPUser {
        val response = execute("auth/me", "PATCH", buildJsonObject { put("preferences", preferences) }.toString())
        return json.decodeFromString<CurrentUserResponse>(response).user
    }

    suspend fun testPush(type: String, config: JsonObject): JsonObject =
        requestObject("push/test", "POST", buildJsonObject {
            put("type", type); put("config", config)
        })

    suspend fun logout() {
        execute("auth/logout", "POST", "{}")
        cookieStore.clear()
    }

    suspend fun readResources(resource: String): List<JsonObject> {
        validateResource(resource)
        val element = json.parseToJsonElement(execute(resource))
        return (element as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
    }

    suspend fun createResource(resource: String, fields: JsonObject): JsonElement {
        validateResource(resource)
        return json.parseToJsonElement(execute(resource, "POST", fields.toString()))
    }

    suspend fun updateResource(resource: String, id: String, fields: JsonObject): JsonElement {
        validateResource(resource)
        require(id.isNotBlank()) { "记录编号不能为空" }
        return json.parseToJsonElement(execute("$resource/$id", "PUT", fields.toString()))
    }

    suspend fun deleteResource(resource: String, id: String) {
        validateResource(resource)
        require(id.isNotBlank()) { "记录编号不能为空" }
        execute("$resource/$id", "DELETE")
    }

    suspend fun renameArchive(id: String, title: String): JsonObject =
        requestObject("archives/$id/name", "PATCH", buildJsonObject { put("title", title) })

    suspend fun restoreRecycleItem(id: String) {
        requestObject("recycle_bin/restore/$id", "POST", JsonObject(emptyMap()))
    }

    suspend fun permanentlyDeleteRecycleItem(id: String) {
        execute("recycle_bin/$id", "DELETE")
    }

    suspend fun emptyRecycleBin() {
        execute("recycle_bin/empty/all", "DELETE")
    }

    suspend fun emailMessages(): List<JsonObject> = requestObjectList("email/fetch")

    suspend fun emailMessage(id: String): JsonObject = requestObject("email/messages/$id")

    suspend fun sendEmail(to: String, subject: String, text: String) {
        requestObject("email/send", "POST", buildJsonObject {
            put("to", to); put("subject", subject); put("text", text)
        })
    }

    suspend fun backupCatalog(): List<JsonObject> =
        requestObject("backup/catalog")["backups"]?.let { it as? JsonArray }
            ?.mapNotNull { it as? JsonObject }.orEmpty()

    suspend fun maintenanceJobs(): List<JsonObject> =
        requestObject("backup/jobs")["jobs"]?.let { it as? JsonArray }
            ?.mapNotNull { it as? JsonObject }.orEmpty()

    suspend fun createBackup(currentPassword: String) {
        requestObject("backup/jobs", "POST", buildJsonObject {
            put("operation", "backup"); put("currentPassword", currentPassword)
        })
    }

    suspend fun restoreBackup(backupId: String, currentPassword: String) {
        requestObject("backup/jobs", "POST", buildJsonObject {
            put("operation", "restore"); put("backupId", backupId)
            put("confirmation", backupId); put("maintenanceAcknowledged", true)
            put("currentPassword", currentPassword)
        })
    }

    suspend fun uploadFile(name: String, contentType: String, bytes: ByteArray): JsonObject =
        withContext(Dispatchers.IO) {
            if (contentType.startsWith("video/")) return@withContext uploadVideoChunks(name, contentType, bytes)
            val fileBody = bytes.toRequestBody(contentType.toMediaType())
            val multipart = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("file", name, fileBody).build()
            val request = Request.Builder().url(root + "upload")
                .header("Accept", "application/json")
                .header("Origin", origin)
                .post(multipart).build()
            http.newCall(request).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) throw ApiException(messageFor(response.code), response.code)
                json.parseToJsonElement(responseBody).jsonObject
            }
        }

    suspend fun uploadFile(name: String, contentType: String, file: File): JsonObject =
        withContext(Dispatchers.IO) {
            if (contentType.startsWith("video/")) return@withContext uploadVideoChunks(name, contentType, file)
            val multipart = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("file", name, file.asRequestBody(contentType.toMediaType())).build()
            val request = Request.Builder().url(root + "upload")
                .header("Accept", "application/json").header("Origin", origin)
                .post(multipart).build()
            http.newCall(request).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) throw ApiException(messageFor(response.code), response.code)
                json.parseToJsonElement(responseBody).jsonObject
            }
        }

    private fun uploadVideoChunks(name: String, contentType: String, bytes: ByteArray): JsonObject {
        val initBody = buildJsonObject {
            put("fileName", name); put("fileSize", bytes.size); put("mimeType", contentType)
        }
        val initialized = json.parseToJsonElement(executeBlocking("upload/chunks/init", "POST", initBody.toString())).jsonObject
        initialized["completedUpload"]?.let { return it.jsonObject }
        val uploadId = initialized["uploadId"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
            ?: error("服务器未返回上传编号")
        val chunkSize = initialized["chunkSize"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() }
            ?: 4 * 1024 * 1024
        val uploaded = (initialized["uploadedChunks"] as? JsonArray)?.mapNotNull {
            (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull()
        }?.toSet().orEmpty()
        val count = (bytes.size + chunkSize - 1) / chunkSize
        for (index in 0 until count) {
            if (index in uploaded) continue
            val start = index * chunkSize
            val end = minOf(bytes.size, start + chunkSize)
            executeBytes("upload/chunks/$uploadId/$index", bytes.copyOfRange(start, end))
        }
        return json.parseToJsonElement(executeBlocking("upload/chunks/$uploadId/complete", "POST", "{}")).jsonObject
    }

    private fun uploadVideoChunks(name: String, contentType: String, file: File): JsonObject {
        val initBody = buildJsonObject {
            put("fileName", name); put("fileSize", file.length()); put("mimeType", contentType)
        }
        val initialized = json.parseToJsonElement(executeBlocking("upload/chunks/init", "POST", initBody.toString())).jsonObject
        initialized["completedUpload"]?.let { return it.jsonObject }
        val uploadId = initialized["uploadId"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
            ?: error("服务器未返回上传编号")
        val chunkSize = initialized["chunkSize"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() }
            ?: 4 * 1024 * 1024
        val uploaded = (initialized["uploadedChunks"] as? JsonArray)?.mapNotNull {
            (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull()
        }?.toSet().orEmpty()
        val count = ((file.length() + chunkSize - 1) / chunkSize).toInt()
        RandomAccessFile(file, "r").use { input ->
            for (index in 0 until count) {
                if (index in uploaded) continue
                val expected = minOf(chunkSize.toLong(), file.length() - index.toLong() * chunkSize).toInt()
                val chunk = ByteArray(expected)
                input.seek(index.toLong() * chunkSize)
                input.readFully(chunk)
                executeBytes("upload/chunks/$uploadId/$index", chunk)
            }
        }
        return json.parseToJsonElement(executeBlocking("upload/chunks/$uploadId/complete", "POST", "{}")).jsonObject
    }

    private fun executeBlocking(path: String, method: String, body: String): String {
        val requestBody = body.toRequestBody("application/json; charset=utf-8".toMediaType())
        val builder = Request.Builder().url(root + path).header("Accept", "application/json").header("Origin", origin)
        if (method == "POST") builder.post(requestBody) else builder.put(requestBody)
        http.newCall(builder.build()).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw ApiException(messageFor(response.code), response.code)
            return responseBody
        }
    }

    private fun executeBytes(path: String, bytes: ByteArray) {
        val request = Request.Builder().url(root + path)
            .header("Accept", "application/json").header("Origin", origin)
            .put(bytes.toRequestBody("application/octet-stream".toMediaType())).build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw ApiException(messageFor(response.code), response.code)
        }
    }

    suspend fun download(path: String): ByteArray = withContext(Dispatchers.IO) {
        val url = if (path.startsWith("http")) path else root.removeSuffix("api/") + path.trimStart('/')
        http.newCall(Request.Builder().url(url).get().build()).execute().use { response ->
            if (!response.isSuccessful) throw ApiException(messageFor(response.code), response.code)
            response.body?.bytes() ?: ByteArray(0)
        }
    }

    private suspend fun requestObjectList(path: String): List<JsonObject> {
        val value = json.parseToJsonElement(execute(path))
        return when (value) {
            is JsonArray -> value.mapNotNull { it as? JsonObject }
            is JsonObject -> value.values.firstOrNull { it is JsonArray }
                ?.let { it as JsonArray }?.mapNotNull { it as? JsonObject }.orEmpty()
            else -> emptyList()
        }
    }

    private suspend fun requestObject(
        path: String,
        method: String = "GET",
        body: JsonObject? = null
    ): JsonObject {
        val raw = execute(path, method, body?.toString())
        if (raw.isBlank()) return JsonObject(emptyMap())
        return json.parseToJsonElement(raw).jsonObject
    }

    private suspend fun execute(path: String, method: String = "GET", body: String? = null): String =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder().url(root + path.trimStart('/')).header("Accept", "application/json")
            val requestBody = body?.toRequestBody("application/json; charset=utf-8".toMediaType())
            when (method) {
                "GET" -> builder.get()
                "POST" -> builder.post(requestBody ?: ByteArray(0).toRequestBody())
                "PUT" -> builder.put(requestBody ?: ByteArray(0).toRequestBody())
                "PATCH" -> builder.patch(requestBody ?: ByteArray(0).toRequestBody())
                "DELETE" -> if (requestBody == null) builder.delete() else builder.delete(requestBody)
                else -> error("不支持的请求方法")
            }
            if (method != "GET") builder.header("Origin", origin)
            try {
                http.newCall(builder.build()).execute().use { response ->
                    val responseBody = response.body?.string().orEmpty()
                    if (!response.isSuccessful) throw ApiException(messageFor(response.code), response.code)
                    responseBody
                }
            } catch (error: SocketTimeoutException) {
                throw ApiException("连接超时，请检查网络后重试")
            } catch (error: ApiException) {
                throw error
            } catch (error: IOException) {
                throw ApiException("无法连接服务器，请检查网络")
            }
        }

    private fun validateResource(resource: String) {
        require(resource in RESOURCES) { "不支持的业务模块" }
    }

    private fun messageFor(status: Int): String = when (status) {
        401 -> "登录已失效，请重新登录"
        403 -> "没有权限执行此操作"
        404 -> "未找到请求的内容"
        409 -> "数据已发生变化，请刷新后重试"
        429 -> "操作过于频繁，请稍后再试"
        else -> "服务器暂时无法处理请求（$status）"
    }

    companion object {
        val RESOURCES = setOf(
            "projects", "clients", "equipment", "schedule", "docs", "archives",
            "production", "users", "settings", "payments", "approvals", "worklogs",
            "messages", "channels", "email_configs", "announcements",
            "recycle_bin"
        )
    }
}
