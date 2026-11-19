package cn.i2000.ierp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.i2000.ierp.data.BusinessModule
import cn.i2000.ierp.data.BusinessModules
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun DashboardScreen(state: IERPUiState, openModule: (BusinessModule) -> Unit) {
    val active = state.projects.count { Presentation.projectBusinessStatus(it) == "Active" }
    val pending = state.projects.count { Presentation.projectBusinessStatus(it) == "Pending" }
    val completed = state.projects.count { Presentation.projectBusinessStatus(it) == "Completed" }
    val risks = state.projects.filter { Presentation.display(it["keyRisks"]).isNotBlank() }
    val average = if (state.projects.isEmpty()) 0 else state.projects.sumOf { Presentation.progress(it["progress"]) } / state.projects.size
    val projectsModule = BusinessModules.byResource("projects")!!
    val approvalsModule = BusinessModules.byResource("approvals")!!

    LazyColumn(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Column(Modifier.padding(top = 16.dp, bottom = 2.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("我的首页", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
                Text(
                    "${state.user?.nickname?.ifBlank { state.user.username } ?: "当前用户"} / ${state.user?.department.orEmpty()} · 已连接",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MetricTile("在建工程", "$active", "待启动 $pending", Icons.Default.Business, StatusTone.INFO, Modifier.weight(1f)) { openModule(projectsModule) }
                MetricTile("平均进度", "$average%", "已竣工 $completed", Icons.AutoMirrored.Filled.ShowChart, StatusTone.SUCCESS, Modifier.weight(1f)) { openModule(projectsModule) }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MetricTile("风险提醒", "${risks.size}", if (risks.isEmpty()) "暂无风险" else "需要跟进", Icons.Default.Warning, if (risks.isEmpty()) StatusTone.SUCCESS else StatusTone.DANGER, Modifier.weight(1f)) { openModule(projectsModule) }
                MetricTile("业务待办", "进入", "审批 · 日程", Icons.Default.Checklist, StatusTone.WARNING, Modifier.weight(1f)) { openModule(approvalsModule) }
            }
        }
        item { SectionTitle("工程概览", "点击工程进入完整项目管理") }
        if (state.projects.isEmpty()) {
            item { IERPEmptyState("暂无可见工程", "下拉刷新后仍无数据时，请核对账号权限。", Icons.Default.Business) }
        } else {
            items(minOf(state.projects.size, 6)) { index ->
                val project = state.projects[index]
                ProjectSummaryCard(project = project, onClick = { openModule(projectsModule) })
            }
        }
        if (risks.isNotEmpty()) {
            item {
                PanelCard("风险预警", "来自工程记录中的关键风险") {
                    risks.take(5).forEach { project ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(project["name"]?.jsonPrimitive?.contentOrNull ?: "未命名工程", fontWeight = FontWeight.Bold)
                            Text(Presentation.display(project["keyRisks"]), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, maxLines = 2)
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(18.dp)) }
    }
}
