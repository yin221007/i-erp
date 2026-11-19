package cn.i2000.ierp.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import cn.i2000.ierp.data.BusinessModule
import cn.i2000.ierp.data.BusinessModules
import cn.i2000.ierp.data.FieldKind
import cn.i2000.ierp.data.FieldDefinition
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.add
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

private data class Destination(val title: String, val icon: ImageVector)

private val destinations = listOf(
    Destination("首页", Icons.Default.Home),
    Destination("工程", Icons.Default.Business),
    Destination("待办", Icons.Default.TaskAlt),
    Destination("沟通", Icons.Default.Forum),
    Destination("全部", Icons.Default.Apps)
)

@Composable
fun IERPApp(appState: AppState = viewModel()) {
    IERPTheme {
        WebWorkspace(sessionCookies = appState.webCookies())
    }
}

@Composable
private fun LoginScreen(state: IERPUiState, login: (String, String) -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp), contentAlignment = Alignment.Center) {
        Surface(
            modifier = Modifier.fillMaxWidth().sizeIn(maxWidth = 440.dp),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 4.dp
        ) {
          Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(Modifier.width(58.dp).height(58.dp).background(IERPBlue, RoundedCornerShape(17.dp)), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.AccountBalance, null, tint = androidx.compose.ui.graphics.Color.White)
            }
            Text("海牛 ERP", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
            Text("厨房设备工程管理系统", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("账号") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().height(64.dp)
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("密码") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth().height(64.dp)
            )
            Button(
                onClick = { login(username, password) },
                enabled = !state.isWorking,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                if (state.isWorking) CircularProgressIndicator(Modifier.height(24.dp)) else Text("登录")
            }
            Text("登录后保持在线，退出登录或修改密码时会立即失效。", style = MaterialTheme.typography.bodySmall)
          }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(
    state: IERPUiState,
    appState: AppState,
    refresh: () -> Unit,
    logout: () -> Unit,
    openModule: (BusinessModule) -> Unit,
    closeModule: () -> Unit,
    saveRecord: (String?, JsonObject) -> Unit,
    deleteRecord: (String) -> Unit
) {
    var selected by remember { mutableIntStateOf(0) }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 600.dp
        Scaffold(
            contentWindowInsets = WindowInsets.navigationBars,
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text(state.activeModule?.title ?: destinations[selected].title, fontWeight = FontWeight.Black)
                            Text(
                                state.activeModule?.let(Presentation::moduleSubtitle) ?: "海牛 ERP · 核心业务",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    },
                    navigationIcon = {
                        if (state.activeModule != null) {
                            IconButton(onClick = closeModule) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回全部模块") }
                        }
                    },
                    actions = {
                        IconButton(onClick = refresh, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)) {
                            Icon(Icons.Default.Refresh, "刷新")
                        }
                        IconButton(onClick = logout, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)) {
                            Icon(Icons.AutoMirrored.Filled.ExitToApp, "退出登录")
                        }
                    }
                )
            },
            bottomBar = {
                if (!wide) NavigationBar {
                    destinations.forEachIndexed { index, destination ->
                        NavigationBarItem(
                            selected = selected == index,
                            onClick = {
                                selected = index
                                if (index != 4) closeModule()
                            },
                            icon = { Icon(destination.icon, destination.title) },
                            label = { Text(destination.title) }
                        )
                    }
                }
            }
        ) { padding ->
            Row(Modifier.fillMaxSize().padding(padding)) {
                if (wide) NavigationRail {
                    Spacer(Modifier.height(8.dp))
                    destinations.forEachIndexed { index, destination ->
                        NavigationRailItem(
                            selected = selected == index,
                            onClick = {
                                selected = index
                                if (index != 4) closeModule()
                            },
                            icon = { Icon(destination.icon, destination.title) },
                            label = { Text(destination.title) }
                        )
                    }
                }
                ScreenContent(
                    index = selected,
                    state = state,
                    appState = appState,
                    refresh = refresh,
                    openModule = openModule,
                    saveRecord = saveRecord,
                    deleteRecord = deleteRecord,
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterialApi::class)
@Composable
private fun ScreenContent(
    index: Int,
    state: IERPUiState,
    appState: AppState,
    refresh: () -> Unit,
    openModule: (BusinessModule) -> Unit,
    saveRecord: (String?, JsonObject) -> Unit,
    deleteRecord: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val pullState = rememberPullRefreshState(state.isWorking, refresh)
    Box(modifier.fillMaxSize().pullRefresh(pullState)) {
        when {
            state.activeModule?.id == "mail" -> MailScreen(
                state.moduleRecords, state.emailDetail, appState::openEmail,
                appState::closeEmail, appState::sendEmail, appState::openAttachment
            )
            state.activeModule?.id == "backup" -> BackupScreen(state.moduleRecords, appState::createBackup, appState::restoreBackup)
            state.activeModule?.id == "profile" -> ProfileScreen(state.user!!, appState::updatePreferences, appState::testPush)
            state.activeModule?.id == "recycle_bin" -> RecycleBinScreen(
                state.moduleRecords, appState::restoreRecycleItem,
                appState::permanentlyDeleteRecycleItem, appState::emptyRecycleBin
            )
            state.activeModule != null -> BusinessModuleScreen(
                state.activeModule, state.moduleRecords, state.projects,
                state.user?.let { it.role == "Admin" || it.isDefaultAdmin } == true, saveRecord, deleteRecord,
                state.user?.let { it.permission == "ReadWrite" || it.role == "Admin" || it.isDefaultAdmin } == true,
                appState::uploadArchive, appState::openAttachment, appState::actOnApproval,
                appState::markAllProduction, appState::importProductionCsv
            )
            index == 0 -> DashboardScreen(state, openModule)
            index == 1 -> ProjectScreen(state, openModule)
            index == 2 -> QuickModulesScreen(
                listOf("approvals", "schedule", "worklogs"), openModule
            )
            index == 3 -> QuickModulesScreen(
                listOf("messages", "channels", "announcements", "email_configs"), openModule
            )
            else -> AllModulesScreen(state.user?.let { it.role == "Admin" || it.isDefaultAdmin } == true, openModule)
        }
        PullRefreshIndicator(state.isWorking, pullState, Modifier.align(Alignment.TopCenter))
    }
}

@Composable
private fun ProjectScreen(state: IERPUiState, openModule: (BusinessModule) -> Unit) {
    val projectsModule = BusinessModules.byResource("projects")!!
    LazyColumn(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Column(Modifier.padding(top = 16.dp, bottom = 4.dp)) {
            Text("我的工程项目", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
            Text("查阅并跟进工程进度", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } }
        if (state.projects.isEmpty()) item { IERPEmptyState("暂无可见工程", "下拉刷新后仍无数据时，请核对账号权限。", Icons.Default.Business) }
        items(state.projects) { project ->
            ProjectSummaryCard(project) { openModule(projectsModule) }
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

@Composable
private fun QuickModulesScreen(resources: List<String>, onSelect: (BusinessModule) -> Unit) {
    val modules = resources.mapNotNull(BusinessModules::byResource)
    LazyColumn(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { SectionTitle(if (resources.contains("approvals")) "我的待办" else "团队沟通", "选择业务进入完整页面") }
        items(modules) { module -> ModuleEntryCard(module, { onSelect(module) }) }
    }
}

@Composable
private fun AllModulesScreen(isAdmin: Boolean, onSelect: (BusinessModule) -> Unit) {
    val modules = BusinessModules.all.filter { !it.administratorOnly || isAdmin }
    val groups = listOf(
        "核心业务" to listOf("projects", "clients", "production", "approvals", "payments", "schedule", "worklogs", "mail", "messages"),
        "数据管理" to listOf("archives", "media", "equipment", "docs", "channels", "announcements"),
        "系统管理" to listOf("profile", "email_configs", "users", "settings", "recycle_bin", "backup")
    )
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("全部功能", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
        Text("按网页端业务层级排列", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(18.dp))
        groups.forEach { (title, ids) ->
            val group = ids.mapNotNull { id -> modules.firstOrNull { it.id == id } }
            if (group.isNotEmpty()) {
                SectionTitle(title)
                Spacer(Modifier.height(10.dp))
                group.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        row.forEach { module -> ModuleEntryCard(module, { onSelect(module) }, Modifier.weight(1f)) }
                        if (row.size == 1) Spacer(Modifier.weight(1f).width(12.dp))
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }
        }
    }
}

@Composable
private fun ModuleCard(module: BusinessModule, onSelect: (BusinessModule) -> Unit) {
    ModuleEntryCard(module, { onSelect(module) })
}

@Composable
private fun BusinessModuleScreen(
    module: BusinessModule,
    records: List<JsonObject>,
    projects: List<JsonObject>,
    isAdmin: Boolean,
    onSave: (String?, JsonObject) -> Unit,
    onDelete: (String) -> Unit,
    hasWriteAccess: Boolean,
    onUploadArchive: (String, String, String, String, String, String, String, String, String) -> Unit,
    onOpenAttachment: (String, String, String) -> Unit,
    onApprovalAction: (String, String, String) -> Unit,
    onMarkAllProduction: (String, String) -> Unit,
    onImportProductionCsv: (String, String) -> Unit
) {
    var query by remember(module.resource) { mutableStateOf("") }
    var editing by remember { mutableStateOf<JsonObject?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<JsonObject?>(null) }
    var viewing by remember { mutableStateOf<JsonObject?>(null) }
    val writable = hasWriteAccess && !module.readOnly && (!module.administratorOnly || isAdmin)
    val filtered = records.filter { record ->
        query.isBlank() || record.values.any { it.toString().contains(query, ignoreCase = true) }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (module.resource == "archives" && hasWriteAccess) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
                ArchiveUploadButton(module, projects, onUploadArchive)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("搜索") },
                singleLine = true,
                modifier = Modifier.weight(1f).height(60.dp)
            )
            if (writable) {
                IconButton(
                    onClick = { creating = true },
                    modifier = Modifier.sizeIn(minWidth = 52.dp, minHeight = 52.dp)
                ) { Icon(Icons.Default.Add, "新建") }
            }
        }
        LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (filtered.isEmpty()) item { IERPEmptyState("暂无${module.title}数据", "下拉刷新，或使用页面顶部的新建与上传操作。", moduleIcon(module)) }
            items(filtered) { record ->
                val id = record["id"]?.jsonPrimitive?.contentOrNull.orEmpty()
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (module.id == "projects") ProjectSummaryCard(record) { viewing = record }
                    else BusinessRecordCard(module, record) { viewing = record }
                    if (writable && id.isNotBlank()) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            TextButton(onClick = { editing = record }, modifier = Modifier.sizeIn(minHeight = 48.dp)) { Icon(Icons.Default.Edit, null); Spacer(Modifier.width(5.dp)); Text("编辑") }
                            TextButton(onClick = { deleting = record }, modifier = Modifier.sizeIn(minHeight = 48.dp)) { Icon(Icons.Default.Delete, null); Spacer(Modifier.width(5.dp)); Text("删除") }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(12.dp)) }
        }
    }

    if (creating) RecordEditorDialog(module, null, { creating = false }) { fields ->
        creating = false
        onSave(null, fields)
    }
    viewing?.let { record -> RecordDetailDialog(
        module, record, onDismiss = { viewing = null }, onOpenAttachment = onOpenAttachment,
        onApprovalAction = onApprovalAction, hasWriteAccess = writable,
        onMarkAllProduction = onMarkAllProduction, onImportProductionCsv = onImportProductionCsv
    ) }
    editing?.let { record -> RecordEditorDialog(module, record, { editing = null }) { fields ->
        editing = null
        onSave(record["id"]?.jsonPrimitive?.contentOrNull, fields)
    } }
    deleting?.let { record ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("确认删除") },
            text = { Text("删除“${recordTitle(module, record)}”后将按服务端规则进入回收站。") },
            confirmButton = {
                TextButton(onClick = {
                    val id = record["id"]?.jsonPrimitive?.contentOrNull.orEmpty()
                    deleting = null
                    if (id.isNotBlank()) onDelete(id)
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("取消") } }
        )
    }
}

private fun recordTitle(module: BusinessModule, record: JsonObject): String =
    module.titleKeys.firstNotNullOfOrNull { record[it]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank) }
        ?: record["id"]?.jsonPrimitive?.contentOrNull
        ?: "未命名记录"

@Composable
private fun RecordEditorDialog(
    module: BusinessModule,
    record: JsonObject?,
    onDismiss: () -> Unit,
    onSave: (JsonObject) -> Unit
) {
    val values = remember(module.resource, record) {
        mutableStateMapOf<String, String>().apply {
            module.fields.forEach { field ->
                val value = record?.get(field.key)
                this[field.key] = when {
                    value == null -> if (field.kind == FieldKind.BOOLEAN) "false" else ""
                    field.kind in listOf(FieldKind.TEXT, FieldKind.MULTILINE, FieldKind.DATE, FieldKind.PASSWORD, FieldKind.CHOICE) ->
                        value.jsonPrimitive.contentOrNull.orEmpty()
                    else -> value.toString()
                }
            }
        }
    }
    var validationError by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (record == null) "新建${module.title}" else "编辑${module.title}") },
        text = {
            Column(
                Modifier.height(480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                module.fields.forEach { field ->
                    FieldEditor(field, values[field.key].orEmpty()) { values[field.key] = it }
                }
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val missing = module.fields.firstOrNull { it.required && values[it.key].isNullOrBlank() }
                if (missing != null) {
                    validationError = "请填写${missing.label}"
                    return@TextButton
                }
                runCatching { buildRecord(module.fields, values) }
                    .onSuccess(onSave)
                    .onFailure { validationError = it.message ?: "输入格式不正确" }
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

@Composable
private fun FieldEditor(field: FieldDefinition, value: String, onChange: (String) -> Unit) {
    if (field.kind == FieldKind.LIST) {
        StructuredListEditor(field, value, onChange)
    } else if (field.kind == FieldKind.CHOICE) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(field.label, style = MaterialTheme.typography.labelLarge)
            field.choices.chunked(2).forEach { choices ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    choices.forEach { choice ->
                        androidx.compose.material3.FilterChip(
                            selected = value == choice,
                            onClick = { onChange(choice) },
                            label = { Text(choice) },
                            modifier = Modifier.weight(1f).sizeIn(minHeight = 48.dp)
                        )
                    }
                    if (choices.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    } else if (field.kind == FieldKind.BOOLEAN) {
        Row(
            Modifier.fillMaxWidth().sizeIn(minHeight = 52.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(checked = value.toBoolean(), onCheckedChange = { onChange(it.toString()) })
            Text(field.label)
        }
    } else {
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            label = { Text(field.label) },
            supportingText = field.hint.takeIf(String::isNotBlank)?.let { hint -> { Text(hint) } },
            visualTransformation = if (field.kind == FieldKind.PASSWORD) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(
                keyboardType = if (field.kind == FieldKind.NUMBER) KeyboardType.Decimal else KeyboardType.Text
            ),
            minLines = if (field.kind == FieldKind.MULTILINE) 3 else 1,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

private fun buildRecord(
    fields: List<FieldDefinition>,
    values: Map<String, String>
): JsonObject = buildJsonObject {
    fields.forEach { field ->
        val raw = values[field.key].orEmpty()
        if (raw.isBlank() && field.kind != FieldKind.BOOLEAN) return@forEach
        when (field.kind) {
            FieldKind.NUMBER -> put(field.key, JsonPrimitive(raw.toDoubleOrNull() ?: error("${field.label}必须是数字")))
            FieldKind.BOOLEAN -> put(field.key, JsonPrimitive(raw.toBoolean()))
            FieldKind.LIST -> put(field.key, Json.parseToJsonElement(raw))
            else -> put(field.key, JsonPrimitive(raw))
        }
    }
}

@Composable
private fun StructuredListEditor(field: FieldDefinition, value: String, onChange: (String) -> Unit) {
    val rows = remember(field.key, value) {
        val array = runCatching { Json.parseToJsonElement(value) as? JsonArray }.getOrNull() ?: JsonArray(emptyList())
        androidx.compose.runtime.mutableStateListOf<JsonObject>().apply {
            addAll(array.mapIndexedNotNull { index, element ->
                when (element) {
                    is JsonObject -> element
                    is JsonPrimitive -> buildJsonObject {
                        put("id", "item-$index")
                        put("value", element)
                    }
                    else -> null
                }
            })
        }
    }
    var editingIndex by remember { mutableStateOf<Int?>(null) }
    var creating by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(field.label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
            TextButton(onClick = { creating = true }, modifier = Modifier.sizeIn(minHeight = 48.dp)) { Text("添加") }
        }
        if (rows.isEmpty()) Text("暂无内容", style = MaterialTheme.typography.bodySmall)
        rows.forEachIndexed { index, row ->
            OutlinedCard(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        field.itemFields.take(3).forEach { child ->
                            val text = row[child.key]?.jsonPrimitive?.contentOrNull.orEmpty()
                            if (text.isNotBlank()) Text("${child.label}：$text", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    TextButton(onClick = { editingIndex = index }) { Text("编辑") }
                    IconButton(onClick = {
                        rows.removeAt(index)
                        onChange(encodeStructuredRows(field, rows))
                    }) { Icon(Icons.Default.Delete, "删除") }
                }
            }
        }
    }

    if (creating) StructuredRowDialog(field, null, { creating = false }) { row ->
        rows.add(row)
        creating = false
        onChange(encodeStructuredRows(field, rows))
    }
    editingIndex?.let { index ->
        StructuredRowDialog(field, rows.getOrNull(index), { editingIndex = null }) { row ->
            if (index in rows.indices) rows[index] = row
            editingIndex = null
            onChange(encodeStructuredRows(field, rows))
        }
    }
}

@Composable
private fun StructuredRowDialog(
    field: FieldDefinition,
    existing: JsonObject?,
    onDismiss: () -> Unit,
    onSave: (JsonObject) -> Unit
) {
    val values = remember(existing) { mutableStateMapOf<String, String>().apply {
        field.itemFields.forEach { child -> this[child.key] = existing?.get(child.key)?.jsonPrimitive?.contentOrNull.orEmpty() }
    } }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "添加${field.label}" else "编辑${field.label}") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            field.itemFields.forEach { child -> FieldEditor(child, values[child.key].orEmpty()) { values[child.key] = it } }
        } },
        confirmButton = { TextButton(onClick = {
            val row = buildRecord(field.itemFields, values)
            onSave(buildJsonObject {
                existing?.forEach { (key, element) -> put(key, element) }
                if (existing?.get("id") == null) put("id", "item-${System.currentTimeMillis()}")
                row.forEach { (key, element) -> put(key, element) }
            })
        }) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

private fun encodeStructuredRows(field: FieldDefinition, rows: List<JsonObject>): String =
    buildJsonArray {
        rows.forEach { row ->
            if (field.itemFields.size == 1 && field.itemFields[0].key == "value") {
                add(row["value"] ?: JsonPrimitive(""))
            } else add(row)
        }
    }.toString()
