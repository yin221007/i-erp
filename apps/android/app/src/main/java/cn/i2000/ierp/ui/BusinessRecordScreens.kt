package cn.i2000.ierp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.i2000.ierp.data.BusinessModule
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

fun businessRecordTitle(module: BusinessModule, record: JsonObject): String =
    module.titleKeys.firstNotNullOfOrNull { record[it]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank) }
        ?: record["id"]?.jsonPrimitive?.contentOrNull
        ?: "未命名记录"

@Composable
fun ProjectSummaryCard(project: JsonObject, onClick: () -> Unit) {
    val title = project["name"]?.jsonPrimitive?.contentOrNull
        ?: project["projectName"]?.jsonPrimitive?.contentOrNull
        ?: "未命名工程"
    val status = Presentation.projectBusinessStatusLabel(project)
    val progress = Presentation.progress(project["progress"])
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 166.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(project["internalContractNo"]?.jsonPrimitive?.contentOrNull.orEmpty().ifBlank { "工程项目" }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                if (status.isNotBlank()) StatusChip(status)
            }
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, maxLines = 2)
            Text(
                listOfNotNull(
                    project["clientName"]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank),
                    project["deadline"]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank)?.let { "交付 $it" }
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
            LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth().height(7.dp), trackColor = MaterialTheme.colorScheme.surfaceVariant)
            Row {
                Text("工程进度", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                Text("$progress%", style = MaterialTheme.typography.labelMedium, color = IERPBlue, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun BusinessRecordCard(module: BusinessModule, record: JsonObject, onClick: () -> Unit) {
    val status = Presentation.display(record["status"])
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 142.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    Modifier.size(38.dp).background(IERPBlue.copy(alpha = 0.1f), RoundedCornerShape(11.dp)),
                    contentAlignment = Alignment.Center
                ) { Icon(moduleIcon(module), null, tint = IERPBlue, modifier = Modifier.size(21.dp)) }
                Spacer(Modifier.width(11.dp))
                Text(businessRecordTitle(module, record), modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2)
                if (status.isNotBlank()) StatusChip(status)
            }
            Presentation.summaryKeys(module).take(3).forEach { key ->
                val value = Presentation.display(record[key])
                if (value.isNotBlank()) {
                    Row {
                        Text(Presentation.fieldLabel(key), modifier = Modifier.width(62.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                        Text(if (key.contains("Amount")) Presentation.currency(record[key]) else value, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("查看详情", style = MaterialTheme.typography.labelMedium, color = IERPBlue, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = IERPBlue, modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
fun ModuleEntryCard(module: BusinessModule, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().sizeIn(minHeight = 92.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(42.dp).background(IERPBlue.copy(alpha = 0.1f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Icon(moduleIcon(module), null, tint = IERPBlue, modifier = Modifier.size(23.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(module.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(Presentation.moduleSubtitle(module), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
            }
        }
    }
}
