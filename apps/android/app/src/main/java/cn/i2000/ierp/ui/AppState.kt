package cn.i2000.ierp.ui

import android.app.Application
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import cn.i2000.ierp.BuildConfig
import cn.i2000.ierp.data.ApiClient
import cn.i2000.ierp.data.ApiException
import cn.i2000.ierp.data.BusinessModule
import cn.i2000.ierp.data.IERPUser
import cn.i2000.ierp.data.PersistentCookieStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import okhttp3.Cookie

data class IERPUiState(
    val isRestoring: Boolean = true,
    val isWorking: Boolean = false,
    val user: IERPUser? = null,
    val projects: List<JsonObject> = emptyList(),
    val activeModule: BusinessModule? = null,
    val moduleRecords: List<JsonObject> = emptyList(),
    val emailDetail: JsonObject? = null,
    val error: String? = null
)

class AppState(application: Application) : AndroidViewModel(application) {
    private val cookieStore = PersistentCookieStore(
        application.getSharedPreferences("ierp_session", Application.MODE_PRIVATE)
    )
    private val api = ApiClient(BuildConfig.IERP_API_BASE_URL, BuildConfig.IERP_ORIGIN, cookieStore)
    private val mutableState = MutableStateFlow(IERPUiState())
    val state: StateFlow<IERPUiState> = mutableState.asStateFlow()
    private var pollingJob: Job? = null

    init {
        restoreSession()
    }

    /** The WebView receives the exact authenticated server cookies from native login. */
    fun webCookies(): List<Cookie> = cookieStore.cookies()

    fun login(username: String, password: String) {
        if (username.isBlank() || password.isEmpty()) {
            mutableState.value = mutableState.value.copy(error = "请输入账号和密码")
            return
        }
        launchWork {
            val user = api.login(username.trim(), password)
            mutableState.value = mutableState.value.copy(user = user, error = null)
            refreshProjects()
        }
    }

    fun refresh() = launchWork {
        val module = mutableState.value.activeModule
        if (module == null) refreshProjects() else refreshModule(module)
    }

    fun openModule(module: BusinessModule) = launchWork {
        pollingJob?.cancel()
        mutableState.value = mutableState.value.copy(
            activeModule = module,
            moduleRecords = emptyList(),
            emailDetail = if (module.id == "mail") null else mutableState.value.emailDetail
        )
        refreshModule(module)
        if (module.id in setOf("messages", "channels", "announcements", "mail", "backup")) {
            pollingJob = viewModelScope.launch {
                while (true) {
                    delay(5_000)
                    if (mutableState.value.activeModule?.id == module.id && !mutableState.value.isWorking) {
                        runCatching { refreshModule(module) }
                    }
                }
            }
        }
    }

    fun closeModule() {
        pollingJob?.cancel()
        mutableState.value = mutableState.value.copy(activeModule = null, moduleRecords = emptyList())
    }

    fun saveRecord(id: String?, fields: JsonObject) = launchWork {
        val module = mutableState.value.activeModule ?: return@launchWork
        if (id == null) {
            api.createResource(module.resource, prepareCreateFields(module.resource, fields))
        } else {
            val existing = mutableState.value.moduleRecords.firstOrNull {
                it["id"]?.toString()?.trim('"') == id
            }.orEmpty()
            api.updateResource(module.resource, id, JsonObject(existing + fields))
        }
        refreshModule(module)
        if (module.resource == "projects") refreshProjects()
    }

    fun deleteRecord(id: String) = launchWork {
        val module = mutableState.value.activeModule ?: return@launchWork
        api.deleteResource(module.resource, id)
        refreshModule(module)
        if (module.resource == "projects") refreshProjects()
    }

    fun renameArchive(id: String, title: String) = launchWork {
        api.renameArchive(id, title)
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun restoreRecycleItem(id: String) = launchWork {
        api.restoreRecycleItem(id)
        mutableState.value.activeModule?.let { refreshModule(it) }
        refreshProjects()
    }

    fun permanentlyDeleteRecycleItem(id: String) = launchWork {
        api.permanentlyDeleteRecycleItem(id)
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun emptyRecycleBin() = launchWork {
        api.emptyRecycleBin()
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun sendEmail(to: String, subject: String, text: String) = launchWork {
        api.sendEmail(to, subject, text)
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun openEmail(id: String) = launchWork {
        mutableState.value = mutableState.value.copy(emailDetail = api.emailMessage(id))
    }

    fun closeEmail() {
        mutableState.value = mutableState.value.copy(emailDetail = null)
    }

    fun createBackup(password: String) = launchWork {
        api.createBackup(password)
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun updatePreferences(changes: JsonObject) = launchWork {
        val current = mutableState.value.user?.preferences ?: JsonObject(emptyMap())
        val preferences = JsonObject(current + changes)
        val user = api.updateCurrentUser(preferences)
        mutableState.value = mutableState.value.copy(user = user)
    }

    fun testPush(type: String, config: JsonObject) = launchWork {
        api.testPush(type, config)
    }

    fun restoreBackup(id: String, password: String) = launchWork {
        api.restoreBackup(id, password)
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun actOnApproval(id: String, outcomeStatus: String, comment: String) = launchWork {
        val record = mutableState.value.moduleRecords.firstOrNull { it["id"]?.jsonPrimitive?.contentOrNull == id }
            ?: error("审批记录不存在")
        val versions = (record["versions"] as? kotlinx.serialization.json.JsonArray)?.toMutableList()
            ?: mutableListOf()
        if (versions.isEmpty()) error("审批版本不存在")
        val latest = (versions[0] as? JsonObject)?.toMutableMap() ?: error("审批版本格式不正确")
        val outcomes = (latest["outcomes"] as? kotlinx.serialization.json.JsonArray)?.toMutableList()
            ?: mutableListOf()
        val user = mutableState.value.user ?: error("登录已失效")
        outcomes.add(buildJsonObject {
            put("status", outcomeStatus); put("approverId", user.id)
            put("approverName", user.nickname); put("comment", comment)
            put("date", java.time.Instant.now().toString())
        })
        latest["outcomes"] = kotlinx.serialization.json.JsonArray(outcomes)
        versions[0] = JsonObject(latest)
        val approvers = (record["approverIds"] as? kotlinx.serialization.json.JsonArray)
            ?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty()
        val approved = outcomes.mapNotNull { (it as? JsonObject) }
            .filter { it["status"]?.jsonPrimitive?.contentOrNull == "Approved" }
            .mapNotNull { it["approverId"]?.jsonPrimitive?.contentOrNull }.toSet()
        val nextStatus = when (outcomeStatus) {
            "Rejected", "Returned" -> outcomeStatus
            else -> if (record["strategy"]?.jsonPrimitive?.contentOrNull == "OR_SIGN" || approvers.all(approved::contains)) "Approved" else "Pending"
        }
        api.updateResource("approvals", id, JsonObject(record + mapOf(
            "versions" to kotlinx.serialization.json.JsonArray(versions),
            "status" to JsonPrimitive(nextStatus),
            "updatedAt" to JsonPrimitive(java.time.Instant.now().toString())
        )))
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun markAllProduction(id: String, status: String) = launchWork {
        require(status in setOf("Waiting", "InStock", "Shipped")) { "生产状态不正确" }
        val record = mutableState.value.moduleRecords.firstOrNull {
            it["id"]?.jsonPrimitive?.contentOrNull == id
        } ?: error("生产记录不存在")
        val today = java.time.LocalDate.now().toString()
        val items = (record["items"] as? JsonArray).orEmpty().map { item ->
            val row = item as? JsonObject ?: return@map item
            JsonObject(row + mapOf(
                "status" to JsonPrimitive(status),
                "batchDate" to JsonPrimitive(row["batchDate"]?.jsonPrimitive?.contentOrNull?.ifBlank { today } ?: today)
            ))
        }
        api.updateResource("production", id, JsonObject(record + ("items" to JsonArray(items))))
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun importProductionCsv(id: String, csv: String) = launchWork {
        val record = mutableState.value.moduleRecords.firstOrNull {
            it["id"]?.jsonPrimitive?.contentOrNull == id
        } ?: error("生产记录不存在")
        val existing = (record["items"] as? JsonArray)?.toMutableList() ?: mutableListOf()
        val imported = parseProductionCsv(csv, existing.size)
        if (imported.isEmpty()) error("没有识别到有效设备行，请检查 CSV 表头")
        existing.addAll(imported)
        api.updateResource("production", id, JsonObject(record + ("items" to JsonArray(existing))))
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun uploadArchive(
        name: String,
        contentType: String,
        uriText: String,
        projectId: String,
        projectName: String,
        category: String,
        phase: String = "",
        capturedAt: String = "",
        albumTitle: String = ""
    ) = launchWork {
        val context = getApplication<Application>()
        val temporary = withContext(Dispatchers.IO) {
            File(context.cacheDir, "upload-${java.util.UUID.randomUUID()}").also { target ->
                context.contentResolver.openInputStream(android.net.Uri.parse(uriText))?.use { input ->
                    target.outputStream().use(input::copyTo)
                } ?: error("无法读取所选文件")
            }
        }
        val localSize = temporary.length()
        val uploaded = try { api.uploadFile(name, contentType, temporary) } finally { temporary.delete() }
        val url = uploaded["url"]?.jsonPrimitive?.contentOrNull ?: error("服务器未返回文件地址")
        val size = uploaded["size"]?.jsonPrimitive?.contentOrNull ?: localSize.toString()
        val id = "archive-${System.currentTimeMillis()}"
        val record = buildJsonObject {
            put("id", id); put("title", name); put("category", category)
            put("projectId", projectId); put("projectName", projectName)
            put("fileType", name.substringAfterLast('.', "file")); put("size", size); put("url", url)
            put("uploadDate", java.time.LocalDate.now().toString())
            if (category == "Media") {
                put("mediaPhase", phase.ifBlank { "前期对接 & 设计" })
                put("capturedAt", capturedAt.ifBlank { java.time.LocalDate.now().toString() })
                put("mediaType", if (contentType.startsWith("video/")) "video" else "image")
                if (albumTitle.isNotBlank()) put("mediaAlbumTitle", albumTitle.trim())
            }
        }
        api.createResource("archives", record)
        mutableState.value.activeModule?.let { refreshModule(it) }
    }

    fun openAttachment(path: String, name: String, mimeType: String) = launchWork {
        val bytes = api.download(path)
        val directory = File(getApplication<Application>().cacheDir, "downloads").apply { mkdirs() }
        val safeName = name.replace(Regex("[^A-Za-z0-9._\\-\u4e00-\u9fa5]"), "_").ifBlank { "attachment" }
        val file = File(directory, safeName)
        file.writeBytes(bytes)
        val context = getApplication<Application>()
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mimeType.ifBlank { "application/octet-stream" })
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(Intent.createChooser(intent, "打开附件").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun logout() = launchWork {
        api.logout()
        mutableState.value = IERPUiState(isRestoring = false)
    }

    fun clearError() {
        mutableState.value = mutableState.value.copy(error = null)
    }

    private fun restoreSession() {
        viewModelScope.launch {
            val restored = runCatching { api.currentUser() }
            mutableState.value = if (restored.isSuccess) {
                IERPUiState(isRestoring = false, user = restored.getOrNull())
            } else {
                cookieStore.clear()
                IERPUiState(isRestoring = false)
            }
            if (restored.isSuccess) runCatching { refreshProjects() }
        }
    }

    private fun launchWork(block: suspend () -> Unit) {
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(isWorking = true, error = null)
            runCatching { block() }
                .onFailure { error ->
                    if (error is ApiException && error.statusCode == 401) {
                        cookieStore.clear()
                        mutableState.value = IERPUiState(isRestoring = false, error = error.message)
                    } else {
                        mutableState.value = mutableState.value.copy(error = error.message ?: "操作失败")
                    }
                }
            mutableState.value = mutableState.value.copy(isWorking = false, isRestoring = false)
        }
    }

    private suspend fun refreshProjects() {
        val projects = api.readResources("projects")
        mutableState.value = mutableState.value.copy(projects = projects, error = null)
    }

    private suspend fun refreshModule(module: BusinessModule) {
        val records = when (module.id) {
            "mail" -> {
                api.emailMessages()
            }
            "backup" -> {
                val backups = api.backupCatalog().map { JsonObject(it + ("_kind" to JsonPrimitive("backup"))) }
                val jobs = api.maintenanceJobs().map { JsonObject(it + ("_kind" to JsonPrimitive("job"))) }
                backups + jobs
            }
            "profile" -> emptyList()
            else -> api.readResources(module.resource).filter { module.filter?.invoke(it) != false }
        }
        mutableState.value = mutableState.value.copy(moduleRecords = records, error = null)
    }

    private fun prepareCreateFields(resource: String, fields: JsonObject): JsonObject {
        if (resource == "projects") return fields
        val user = mutableState.value.user
        val now = java.time.Instant.now().toString()
        val generatedId = if (resource == "email_configs") user?.id.orEmpty()
            else if (resource == "production") fields["projectId"]?.jsonPrimitive?.contentOrNull.orEmpty()
            else if (resource == "settings") "global_config"
            else "$resource-${java.util.UUID.randomUUID()}"
        return buildJsonObject {
            fields.forEach { (key, value) -> put(key, value) }
            if (fields["id"] == null) put("id", generatedId)
            if (fields["createdAt"] == null) put("createdAt", now)
            when (resource) {
                "worklogs" -> {
                    put("userId", user?.id.orEmpty()); put("userName", user?.nickname.orEmpty())
                    if (fields["date"] == null) put("date", java.time.LocalDate.now().toString())
                }
                "schedule" -> put("userId", user?.id.orEmpty())
                "messages" -> put("timestamp", now)
                "approvals" -> if (fields["status"] == null) put("status", "Draft")
            }
        }
    }
}

private fun parseProductionCsv(text: String, sourceOffset: Int): List<JsonObject> {
    val rows = text.removePrefix("\uFEFF").lineSequence()
        .filter { it.isNotBlank() }
        .map(::parseCsvLine)
        .toList()
    if (rows.size < 2) return emptyList()
    val headers = rows.first().map { it.trim().lowercase() }
    fun index(vararg names: String): Int = headers.indexOfFirst { header -> names.any { header == it.lowercase() } }
    val serial = index("编号", "序号", "编号 / 序号", "serialnumber")
    val name = index("设备名称", "名称", "name")
    val model = index("清单规格/型号", "清单规格 / 型号", "型号", "规格", "model")
    val actual = index("实际生产规格", "actualproductionspec")
    val quantity = index("数量", "quantity", "qty")
    val status = index("状态", "status")
    val notes = index("备注", "notes", "remark")
    val date = index("日期", "批次日期", "batchdate", "date")
    if (name < 0) return emptyList()
    fun List<String>.at(position: Int): String = if (position >= 0) getOrNull(position).orEmpty().trim() else ""
    return rows.drop(1).mapIndexedNotNull { rowIndex, row ->
        val itemName = row.at(name)
        if (itemName.isBlank()) return@mapIndexedNotNull null
        val rawStatus = row.at(status)
        val normalizedStatus = when (rawStatus.lowercase()) {
            "instock", "已入库", "已生产", "已生产 / 已入库" -> "InStock"
            "shipped", "已发货" -> "Shipped"
            else -> "Waiting"
        }
        val modelValue = row.at(model)
        buildJsonObject {
            put("id", "item-${java.util.UUID.randomUUID()}")
            put("serialNumber", row.at(serial)); put("sourceOrder", sourceOffset + rowIndex)
            put("name", itemName); put("model", modelValue)
            put("actualProductionSpec", row.at(actual).ifBlank { modelValue })
            put("quantity", row.at(quantity).toDoubleOrNull()?.takeIf { it > 0 } ?: 1.0)
            put("status", normalizedStatus); put("notes", row.at(notes))
            put("batchDate", row.at(date).ifBlank { java.time.LocalDate.now().toString() })
            put("createdAt", java.time.Instant.now().toString())
        }
    }
}

private fun parseCsvLine(line: String): List<String> {
    val values = mutableListOf<String>()
    val current = StringBuilder()
    var quoted = false
    var index = 0
    while (index < line.length) {
        val char = line[index]
        when {
            char == '"' && quoted && index + 1 < line.length && line[index + 1] == '"' -> {
                current.append('"'); index += 1
            }
            char == '"' -> quoted = !quoted
            char == ',' && !quoted -> { values += current.toString(); current.clear() }
            else -> current.append(char)
        }
        index += 1
    }
    values += current.toString()
    return values
}
