package cn.i2000.ierp.ui

import android.provider.OpenableColumns
import android.net.Uri
import android.text.Html
import androidx.core.content.FileProvider
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.PickVisualMediaRequest
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import cn.i2000.ierp.data.BusinessModule
import cn.i2000.ierp.data.FieldDefinition
import cn.i2000.ierp.data.FieldKind
import cn.i2000.ierp.data.IERPUser
import java.time.LocalDate
import java.io.File
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

private data class PendingUpload(val name: String, val mime: String, val uri: String)

@Composable
internal fun ArchiveUploadButton(
    module: BusinessModule,
    projects: List<JsonObject>,
    upload: (String, String, String, String, String, String, String, String, String) -> Unit
) {
    val context = LocalContext.current
    var pending by remember { mutableStateOf<PendingUpload?>(null) }
    var cameraFile by remember { mutableStateOf<File?>(null) }
    fun accept(uri: Uri?, fallbackName: String? = null, fallbackMime: String? = null) {
        if (uri == null) return
        val resolver = context.contentResolver
        val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        } ?: fallbackName ?: "附件-${System.currentTimeMillis()}"
        pending = PendingUpload(name, resolver.getType(uri) ?: fallbackMime ?: "application/octet-stream", uri.toString())
    }
    val documentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { accept(it) }
    val mediaLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { accept(it) }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) cameraFile?.let { file ->
            accept(FileProvider.getUriForFile(context, "${context.packageName}.files", file), file.name, "image/jpeg")
        }
    }
    if (module.id == "media") {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = { mediaLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
                modifier = Modifier.weight(1f).height(52.dp)
            ) { Text("相册") }
            Button(
                onClick = {
                    val directory = File(context.cacheDir, "downloads").apply { mkdirs() }
                    val file = File(directory, "现场-${System.currentTimeMillis()}.jpg")
                    cameraFile = file
                    cameraLauncher.launch(FileProvider.getUriForFile(context, "${context.packageName}.files", file))
                },
                modifier = Modifier.weight(1f).height(52.dp)
            ) { Text("拍照") }
        }
    } else {
        Button(onClick = { documentLauncher.launch("*/*") }, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text("选择档案文件上传")
        }
    }

    pending?.let { file ->
        ArchiveMetadataDialog(module, projects, file, { pending = null }) { projectId, projectName, category, phase, date, album ->
            pending = null
            upload(file.name, file.mime, file.uri, projectId, projectName, category, phase, date, album)
        }
    }
}

@Composable
private fun ArchiveMetadataDialog(
    module: BusinessModule,
    projects: List<JsonObject>,
    file: PendingUpload,
    dismiss: () -> Unit,
    save: (String, String, String, String, String, String) -> Unit
) {
    var projectId by remember { mutableStateOf(projects.firstOrNull()?.string("id").orEmpty()) }
    var projectName by remember { mutableStateOf(projects.firstOrNull()?.string("name").orEmpty()) }
    var category by remember { mutableStateOf(if (module.id == "media") "Media" else "Other") }
    var phase by remember { mutableStateOf("前期对接 & 设计") }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var album by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = dismiss,
        title = { Text("上传 ${file.name}") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("选择工程", fontWeight = FontWeight.SemiBold)
                projects.forEach { project ->
                    val id = project.string("id")
                    val name = project.string("name")
                    androidx.compose.material3.FilterChip(
                        selected = projectId == id,
                        onClick = { projectId = id; projectName = name },
                        label = { Text(name.ifBlank { id }) },
                        modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp)
                    )
                }
                if (module.id == "media") {
                    Text("拍摄阶段", fontWeight = FontWeight.SemiBold)
                    listOf("前期对接 & 设计", "生产准备", "进场施工", "安装调试", "验收交付", "结算收尾").forEach { value ->
                        androidx.compose.material3.FilterChip(
                            selected = phase == value, onClick = { phase = value }, label = { Text(value) },
                            modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp)
                        )
                    }
                    OutlinedTextField(date, { date = it }, label = { Text("拍摄日期") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(album, { album = it }, label = { Text("影像相册 / 文件夹（可选）") }, modifier = Modifier.fillMaxWidth())
                } else {
                    OutlinedTextField(category, { category = it }, label = { Text("档案分类") }, modifier = Modifier.fillMaxWidth())
                }
            }
        },
        confirmButton = { TextButton(onClick = { if (projectId.isNotBlank()) save(projectId, projectName, category, phase, date, album) }) { Text("上传") } },
        dismissButton = { TextButton(onClick = dismiss) { Text("取消") } }
    )
}

@Composable
internal fun RecordDetailDialog(
    module: BusinessModule,
    record: JsonObject,
    onDismiss: () -> Unit,
    onOpenAttachment: ((String, String, String) -> Unit)? = null,
    onApprovalAction: ((String, String, String) -> Unit)? = null,
    hasWriteAccess: Boolean = false,
    onMarkAllProduction: ((String, String) -> Unit)? = null,
    onImportProductionCsv: ((String, String) -> Unit)? = null
) {
    var approvalComment by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(recordTitleForDetail(module, record)) },
        text = {
            Column(
                Modifier.height(500.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Icon(moduleIcon(module), null, tint = IERPBlue)
                    Spacer(Modifier.weight(1f))
                    val status = if (module.id == "projects") Presentation.projectBusinessStatusLabel(record) else record.string("status")
                    if (status.isNotBlank()) StatusChip(status)
                }
                Text(Presentation.moduleSubtitle(module), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                module.fields.forEach { field ->
                    record[field.key]?.takeUnless { it.toString() == "null" }?.let { value ->
                        StructuredValue(field.label, value, field)
                    }
                }
                if (module.id == "mail") {
                    val body = record.string("text").ifBlank { htmlToReadableText(record.string("html")) }
                    if (body.isNotBlank()) StructuredValue("正文", JsonPrimitive(body), null)
                }
                val remotePath = record.string("url")
                if (remotePath.isNotBlank() && onOpenAttachment != null) {
                    Button(
                        onClick = { onOpenAttachment(remotePath, record.string("title").ifBlank { "附件" }, mimeFor(record)) },
                        modifier = Modifier.fillMaxWidth().height(52.dp)
                    ) { Text("预览或下载附件") }
                }
                if (module.id == "mail" && onOpenAttachment != null) {
                    (record["attachments"] as? JsonArray)?.mapNotNull { it as? JsonObject }?.forEach { attachment ->
                        val part = attachment.string("part")
                        val filename = attachment.string("filename").ifBlank { "邮件附件" }
                        if (part.isNotBlank()) {
                            Button(
                                onClick = {
                                    onOpenAttachment(
                                        "/api/email/messages/${record.string("id")}/attachments/$part",
                                        filename,
                                        attachment.string("contentType")
                                    )
                                },
                                modifier = Modifier.fillMaxWidth().height(48.dp)
                            ) { Text("打开附件：$filename") }
                        }
                    }
                }
                if (module.id == "approvals" && record.string("status") == "Pending" && onApprovalAction != null) {
                    Text("审批处理", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        approvalComment, { approvalComment = it }, label = { Text("审批意见") },
                        minLines = 2, modifier = Modifier.fillMaxWidth()
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onApprovalAction(record.string("id"), "Approved", approvalComment); onDismiss() }, modifier = Modifier.weight(1f).height(48.dp)) { Text("通过") }
                        Button(onClick = { onApprovalAction(record.string("id"), "Returned", approvalComment); onDismiss() }, modifier = Modifier.weight(1f).height(48.dp)) { Text("退回") }
                        Button(onClick = { onApprovalAction(record.string("id"), "Rejected", approvalComment); onDismiss() }, modifier = Modifier.weight(1f).height(48.dp)) { Text("拒绝") }
                    }
                }
                if (module.id == "production") {
                    ProductionActions(
                        record = record,
                        canWrite = hasWriteAccess,
                        markAll = { status ->
                            onMarkAllProduction?.invoke(record.string("id"), status)
                            onDismiss()
                        },
                        importCsv = { csv ->
                            onImportProductionCsv?.invoke(record.string("id"), csv)
                            onDismiss()
                        }
                    )
                }
                val shown = module.fields.map { it.key }.toSet() + if (module.id == "mail") setOf("html", "text") else emptySet()
                record.filterKeys { it !in shown && it !in setOf("id", "password") }.forEach { (key, value) ->
                    if (value !is JsonObject && value !is JsonArray && value.toString() != "null") {
                        StructuredValue(friendlyKey(key), value, null)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("关闭") } }
    )
}

@Composable
private fun ProductionActions(
    record: JsonObject,
    canWrite: Boolean,
    markAll: (String) -> Unit,
    importCsv: (String) -> Unit
) {
    val context = LocalContext.current
    var pendingStatus by remember { mutableStateOf<String?>(null) }
    var localError by remember { mutableStateOf<String?>(null) }
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openOutputStream(uri)?.use { output ->
                output.write(productionCsv(record).toByteArray(Charsets.UTF_8))
            } ?: error("无法写入导出文件")
        }.onFailure { localError = it.message ?: "导出失败" }
    }
    val import = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                ?: error("无法读取 CSV 文件")
        }.onSuccess(importCsv).onFailure { localError = it.message ?: "导入失败" }
    }
    Text("生产工具", style = MaterialTheme.typography.titleMedium)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(
            onClick = { export.launch("${record.string("projectName").ifBlank { "生产清单" }}_全部.csv") },
            modifier = Modifier.weight(1f).height(50.dp)
        ) { Text("导出 CSV") }
        if (canWrite) Button(
            onClick = { import.launch("text/*") },
            modifier = Modifier.weight(1f).height(50.dp)
        ) { Text("导入 CSV") }
    }
    if (canWrite) {
        Text("整单批量标记", style = MaterialTheme.typography.labelLarge)
        listOf("Waiting" to "待生产", "InStock" to "已入库", "Shipped" to "已发货").forEach { (status, label) ->
            Button(onClick = { pendingStatus = status }, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text("全部标记为$label")
            }
        }
    }
    localError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    pendingStatus?.let { status ->
        val label = mapOf("Waiting" to "待生产", "InStock" to "已入库", "Shipped" to "已发货")[status].orEmpty()
        AlertDialog(
            onDismissRequest = { pendingStatus = null },
            title = { Text("确认批量修改") },
            text = { Text("将当前工程全部生产项标记为“$label”？") },
            confirmButton = { TextButton(onClick = { pendingStatus = null; markAll(status) }) { Text("确认") } },
            dismissButton = { TextButton(onClick = { pendingStatus = null }) { Text("取消") } }
        )
    }
}

private fun productionCsv(record: JsonObject): String {
    fun escaped(value: String): String {
        val safe = if (value.firstOrNull() in listOf('=', '+', '-', '@')) "'$value" else value
        return "\"${safe.replace("\"", "\"\"")}\""
    }
    val header = "编号,设备名称,清单规格/型号,实际生产规格,数量,状态,备注,日期"
    val statusLabels = mapOf("Waiting" to "待生产", "InStock" to "已入库", "Shipped" to "已发货")
    val rows = (record["items"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }.map { item ->
        listOf(
            escaped(item.string("serialNumber")), escaped(item.string("name")), escaped(item.string("model")),
            escaped(item.string("actualProductionSpec").ifBlank { item.string("model") }),
            item.string("quantity").ifBlank { "0" }, escaped(statusLabels[item.string("status")] ?: item.string("status")),
            escaped(item.string("notes")), escaped(item.string("batchDate"))
        ).joinToString(",")
    }
    return "\uFEFF" + (listOf(header) + rows).joinToString("\n")
}

private fun htmlToReadableText(html: String): String = Html.fromHtml(
    html.replace(Regex("(?is)<(script|style)[^>]*>.*?</\\1>"), ""),
    Html.FROM_HTML_MODE_LEGACY
).toString().replace(Regex("\\n{3,}"), "\n\n").trim()

@Composable
private fun StructuredValue(label: String, value: JsonElement, field: FieldDefinition?) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
        when (value) {
            is JsonArray -> {
                if (value.isEmpty()) Text("暂无")
                value.forEachIndexed { index, item ->
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                            Text("${label} ${index + 1}", fontWeight = FontWeight.Bold, color = IERPBlue)
                            if (item is JsonObject) {
                                val configured = field?.itemFields.orEmpty()
                                val keys = if (configured.isNotEmpty()) configured.map { it.key }
                                    else item.keys.filterNot { it in setOf("id", "password", "memos") }.take(6)
                                keys.forEach { key ->
                                    val child = item[key] ?: return@forEach
                                    if (child !is JsonArray && child !is JsonObject && child.toString() != "null") {
                                        Row(Modifier.fillMaxWidth()) {
                                            Text(
                                                configured.firstOrNull { it.key == key }?.label ?: friendlyKey(key),
                                                modifier = Modifier.width(78.dp),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                fontWeight = FontWeight.Bold
                                            )
                                            if (key == "status") StatusChip(display(child))
                                            else Text(display(child), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                                        }
                                    } else if (key == "attachments" && child is JsonArray && child.isNotEmpty()) {
                                        Text("附件：${child.size} 个", style = MaterialTheme.typography.bodySmall, color = IERPBlue)
                                    }
                                }
                            } else Text(display(item))
                        }
                    }
                }
            }
            is JsonObject -> value.forEach { (key, child) -> Text("${friendlyKey(key)}：${display(child)}") }
            else -> Text(display(value))
        }
    }
}

@Composable
internal fun MailScreen(
    records: List<JsonObject>,
    detail: JsonObject?,
    open: (String) -> Unit,
    close: () -> Unit,
    send: (String, String, String) -> Unit,
    openAttachment: (String, String, String) -> Unit
) {
    var composing by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<JsonObject?>(null) }
    Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(onClick = { composing = true }, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("写邮件") }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (records.isEmpty()) item { Text("邮箱暂无邮件，或请先在邮箱设置中配置账号。", Modifier.padding(16.dp)) }
            items(records) { mail ->
                OutlinedCard(onClick = { selected = mail; open(mail.string("id")) }, modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 72.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        Text(mail.string("subject").ifBlank { "（无主题）" }, fontWeight = FontWeight.SemiBold)
                        Text(mail.string("from"), style = MaterialTheme.typography.bodySmall)
                        Text(mail.string("date"), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
    if (composing) ComposeMailDialog({ composing = false }) { to, subject, content -> composing = false; send(to, subject, content) }
    (detail ?: selected)?.let { mail ->
        RecordDetailDialog(
            BusinessModule("", "邮件详情", listOf("subject"), emptyList(), id = "mail"),
            mail,
            onDismiss = { selected = null; close() },
            onOpenAttachment = openAttachment
        )
    }
}

@Composable
private fun ComposeMailDialog(dismiss: () -> Unit, send: (String, String, String) -> Unit) {
    var to by remember { mutableStateOf("") }
    var subject by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = dismiss, title = { Text("写邮件") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(to, { to = it }, label = { Text("收件人") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(subject, { subject = it }, label = { Text("主题") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(content, { content = it }, label = { Text("正文") }, minLines = 6, modifier = Modifier.fillMaxWidth())
        } },
        confirmButton = { TextButton(onClick = { if (to.isNotBlank()) send(to, subject, content) }) { Text("发送") } },
        dismissButton = { TextButton(onClick = dismiss) { Text("取消") } }
    )
}

@Composable
internal fun RecycleBinScreen(
    records: List<JsonObject>,
    restore: (String) -> Unit,
    permanentlyDelete: (String) -> Unit,
    empty: () -> Unit
) {
    var confirmEmpty by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (records.isNotEmpty()) Button(onClick = { confirmEmpty = true }, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("清空回收站") }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (records.isEmpty()) item { Text("回收站为空", Modifier.padding(16.dp)) }
            items(records) { row ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(row.string("name").ifBlank { row.string("title").ifBlank { row.string("resource") } }, fontWeight = FontWeight.SemiBold)
                            Text(row.string("deletedAt"), style = MaterialTheme.typography.bodySmall)
                        }
                        IconButton(onClick = { restore(row.string("id")) }) { Icon(Icons.Default.Restore, "恢复") }
                        IconButton(onClick = { permanentlyDelete(row.string("id")) }) { Icon(Icons.Default.DeleteForever, "永久删除") }
                    }
                }
            }
        }
    }
    if (confirmEmpty) AlertDialog(
        onDismissRequest = { confirmEmpty = false }, title = { Text("确认清空回收站") },
        text = { Text("清空后无法恢复。") },
        confirmButton = { TextButton(onClick = { confirmEmpty = false; empty() }) { Text("永久清空") } },
        dismissButton = { TextButton(onClick = { confirmEmpty = false }) { Text("取消") } }
    )
}

@Composable
internal fun BackupScreen(
    records: List<JsonObject>,
    createBackup: (String) -> Unit,
    restoreBackup: (String, String) -> Unit
) {
    var backupPassword by remember { mutableStateOf<String?>(null) }
    var restoreId by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Button(onClick = { backupPassword = "" }, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("立即创建备份") }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (records.isEmpty()) item { Text("暂无可用备份或维护任务", Modifier.padding(16.dp)) }
            items(records) { row ->
                val isBackup = row.string("_kind") == "backup"
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(if (isBackup) row.string("id") else "维护任务 ${row.string("id")}", fontWeight = FontWeight.SemiBold)
                        Text(if (isBackup) row.string("createdAt") else "${row.string("state")} · ${row.string("message")}")
                        if (isBackup && row.boolean("selectable")) {
                            Button(onClick = { restoreId = row.string("id") }, modifier = Modifier.sizeIn(minHeight = 48.dp)) { Text("恢复此备份") }
                        }
                    }
                }
            }
        }
    }
    backupPassword?.let { value -> PasswordDialog("创建备份", value, { backupPassword = it }, { backupPassword = null }) {
        backupPassword = null; createBackup(it)
    } }
    restoreId?.let { id -> PasswordDialog("恢复备份 $id", "", {}, { restoreId = null }) { password ->
        restoreId = null; restoreBackup(id, password)
    } }
}

@Composable
internal fun ProfileScreen(user: IERPUser, save: (JsonObject) -> Unit, testPush: (String, JsonObject) -> Unit) {
    var theme by remember { mutableStateOf(user.preferences["themeColor"]?.jsonPrimitive?.contentOrNull ?: "blue") }
    var font by remember { mutableStateOf(user.preferences["fontSize"]?.jsonPrimitive?.contentOrNull ?: "medium") }
    var date by remember { mutableStateOf(user.preferences["dateFormat"]?.jsonPrimitive?.contentOrNull ?: "YYYY-MM-DD") }
    var time by remember { mutableStateOf(user.preferences["timeFormat"]?.jsonPrimitive?.contentOrNull ?: "24h") }
    var browser by remember { mutableStateOf(user.preferences.boolean("enableBrowser", true)) }
    var sound by remember { mutableStateOf(user.preferences.boolean("sound", true)) }
    val currentTypes = user.preferences["types"] as? JsonObject ?: JsonObject(emptyMap())
    var chat by remember { mutableStateOf(currentTypes.boolean("chat", true)) }
    var approval by remember { mutableStateOf(currentTypes.boolean("approval", true)) }
    var task by remember { mutableStateOf(currentTypes.boolean("task", true)) }
    var system by remember { mutableStateOf(currentTypes.boolean("system", true)) }
    val currentNumbers = user.preferences["numberFormat"] as? JsonObject ?: JsonObject(emptyMap())
    var decimalPlaces by remember { mutableStateOf(currentNumbers.string("decimalPlaces").ifBlank { "2" }) }
    var thousands by remember { mutableStateOf(currentNumbers.boolean("useThousandsSeparator", true)) }
    var currency by remember { mutableStateOf(currentNumbers.string("currencySymbol").ifBlank { "¥" }) }
    val currentWeather = user.preferences["weatherLocation"] as? JsonObject ?: JsonObject(emptyMap())
    var weatherMode by remember { mutableStateOf(currentWeather.string("mode").ifBlank { "auto" }) }
    var city by remember { mutableStateOf(currentWeather.string("city")) }
    val currentWebhooks = user.preferences["webhooks"] as? JsonObject ?: JsonObject(emptyMap())
    var pushPlus by remember { mutableStateOf(currentWebhooks.string("pushPlusToken")) }
    var wecom by remember { mutableStateOf(currentWebhooks.string("wecomWebhook")) }
    var dingtalk by remember { mutableStateOf(currentWebhooks.string("dingtalkWebhook")) }
    var dingtalkSecret by remember { mutableStateOf(currentWebhooks.string("dingtalkSecret")) }
    fun webhookConfig() = buildJsonObject {
        put("pushPlusToken", pushPlus); put("wecomWebhook", wecom)
        put("dingtalkWebhook", dingtalk); put("dingtalkSecret", dingtalkSecret)
    }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text(user.nickname.ifBlank { user.username }, style = MaterialTheme.typography.headlineSmall)
        Text("${user.department} · ${user.role}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("主题颜色", fontWeight = FontWeight.SemiBold)
        listOf("blue", "emerald", "violet", "amber", "rose", "cyan").chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { value ->
                    androidx.compose.material3.FilterChip(theme == value, { theme = value }, { Text(value) }, modifier = Modifier.weight(1f))
                }
            }
        }
        Text("字体大小", fontWeight = FontWeight.SemiBold)
        listOf("small", "medium", "large", "xlarge").chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { value ->
                    androidx.compose.material3.FilterChip(font == value, { font = value }, { Text(value) }, modifier = Modifier.weight(1f))
                }
            }
        }
        OutlinedTextField(date, { date = it }, label = { Text("日期格式") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(time, { time = it }, label = { Text("时间格式（12h / 24h）") }, modifier = Modifier.fillMaxWidth())
        PreferenceToggle("桌面实时推送", browser) { browser = it }
        PreferenceToggle("交互提示音效", sound) { sound = it }
        Text("通知订阅", fontWeight = FontWeight.SemiBold)
        PreferenceToggle("团队即时沟通", chat) { chat = it }
        PreferenceToggle("审批动态", approval) { approval = it }
        PreferenceToggle("工程任务", task) { task = it }
        PreferenceToggle("系统通知", system) { system = it }
        Text("数字格式", fontWeight = FontWeight.SemiBold)
        OutlinedTextField(decimalPlaces, { decimalPlaces = it }, label = { Text("小数位数") }, modifier = Modifier.fillMaxWidth())
        PreferenceToggle("千位分隔符", thousands) { thousands = it }
        OutlinedTextField(currency, { currency = it }, label = { Text("货币符号") }, modifier = Modifier.fillMaxWidth())
        Text("天气位置", fontWeight = FontWeight.SemiBold)
        OutlinedTextField(weatherMode, { weatherMode = it }, label = { Text("定位模式（auto / manual / custom）") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(city, { city = it }, label = { Text("城市") }, modifier = Modifier.fillMaxWidth())
        Text("推送集成", fontWeight = FontWeight.SemiBold)
        OutlinedTextField(pushPlus, { pushPlus = it }, label = { Text("PushPlus Token") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = { testPush("PushPlus", webhookConfig()) }, enabled = pushPlus.isNotBlank(), modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("测试 PushPlus") }
        OutlinedTextField(wecom, { wecom = it }, label = { Text("企业微信 Webhook") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = { testPush("WeCom", webhookConfig()) }, enabled = wecom.isNotBlank(), modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("测试企业微信") }
        OutlinedTextField(dingtalk, { dingtalk = it }, label = { Text("钉钉 Webhook") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(dingtalkSecret, { dingtalkSecret = it }, label = { Text("钉钉安全密钥") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = { testPush("DingTalk", webhookConfig()) }, enabled = dingtalk.isNotBlank(), modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("测试钉钉") }
        Button(onClick = { save(buildJsonObject {
            put("themeColor", theme); put("fontSize", font); put("dateFormat", date); put("timeFormat", time)
            put("enableBrowser", browser); put("sound", sound)
            put("types", buildJsonObject { put("chat", chat); put("approval", approval); put("task", task); put("system", system) })
            put("numberFormat", buildJsonObject {
                put("decimalPlaces", decimalPlaces.toIntOrNull()?.coerceIn(0, 6) ?: 2)
                put("useThousandsSeparator", thousands); put("currencySymbol", currency)
            })
            put("weatherLocation", buildJsonObject { put("mode", weatherMode); if (city.isNotBlank()) put("city", city.trim()) })
            put("webhooks", webhookConfig())
        }) }, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("保存全部个人偏好") }
    }
}

@Composable
private fun PreferenceToggle(label: String, checked: Boolean, changed: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f))
        androidx.compose.material3.Switch(checked = checked, onCheckedChange = changed)
    }
}

@Composable
private fun PasswordDialog(
    title: String,
    initial: String,
    changed: (String) -> Unit,
    dismiss: () -> Unit,
    confirm: (String) -> Unit
) {
    var password by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = dismiss, title = { Text(title) },
        text = { OutlinedTextField(password, { password = it; changed(it) }, label = { Text("当前管理员密码") }, visualTransformation = PasswordVisualTransformation()) },
        confirmButton = { TextButton(onClick = { if (password.isNotEmpty()) confirm(password) }) { Text("确认") } },
        dismissButton = { TextButton(onClick = dismiss) { Text("取消") } }
    )
}

private fun JsonObject.string(key: String): String = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
private fun JsonObject.boolean(key: String, default: Boolean = false): Boolean =
    this[key]?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull() ?: default
private fun display(value: JsonElement): String = when (value) {
    is JsonPrimitive -> value.contentOrNull ?: value.toString()
    is JsonArray -> "${value.size} 项"
    is JsonObject -> "${value.size} 个字段"
    else -> value.toString()
}
private fun recordTitleForDetail(module: BusinessModule, record: JsonObject): String =
    module.titleKeys.firstNotNullOfOrNull { record.string(it).takeIf(String::isNotBlank) }
        ?: record.string("id").ifBlank { module.title }
private fun friendlyKey(key: String): String = mapOf(
    "status" to "状态", "date" to "日期", "createdAt" to "创建时间", "updatedAt" to "更新时间",
    "uploader" to "上传人", "creatorName" to "创建人", "department" to "部门", "role" to "角色",
    "permission" to "权限", "from" to "发件人", "to" to "收件人", "subject" to "主题",
    "content" to "内容", "timestamp" to "时间", "phase" to "阶段", "message" to "说明"
)[key] ?: key
private fun mimeFor(record: JsonObject): String = when (record.string("fileType").lowercase().trimStart('.')) {
    "pdf" -> "application/pdf"
    "jpg", "jpeg" -> "image/jpeg"
    "png" -> "image/png"
    "webp" -> "image/webp"
    "mp4", "m4v" -> "video/mp4"
    "mov" -> "video/quicktime"
    else -> "application/octet-stream"
}
