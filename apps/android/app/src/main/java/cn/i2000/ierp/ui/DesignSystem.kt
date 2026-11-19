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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Announcement
import androidx.compose.material.icons.filled.Approval
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Backup
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Engineering
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.i2000.ierp.data.BusinessModule

val IERPBlue = Color(0xFF2563EB)
val IERPCanvas = Color(0xFFF5F7FB)
val IERPBorder = Color(0xFFE5EAF2)

private val LightColors = lightColorScheme(
    primary = IERPBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDBEAFE),
    onPrimaryContainer = Color(0xFF1E3A8A),
    background = IERPCanvas,
    surface = Color.White,
    surfaceVariant = Color(0xFFF1F5F9),
    outlineVariant = IERPBorder
)

private val DarkColors = darkColorScheme(primary = Color(0xFF60A5FA))

@Composable
fun IERPTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (androidx.compose.foundation.isSystemInDarkTheme()) DarkColors else LightColors, content = content)
}

fun moduleIcon(module: BusinessModule): ImageVector = when (module.id) {
    "projects" -> Icons.Default.Business
    "clients" -> Icons.Default.Group
    "equipment" -> Icons.Default.Inventory2
    "schedule" -> Icons.Default.CalendarMonth
    "docs" -> Icons.Default.Description
    "archives" -> Icons.Default.Archive
    "production" -> Icons.Default.Engineering
    "payments" -> Icons.Default.Payments
    "approvals" -> Icons.Default.Approval
    "worklogs" -> Icons.Default.Work
    "messages", "channels" -> Icons.Default.Forum
    "email_configs", "mail" -> Icons.Default.Email
    "announcements" -> Icons.AutoMirrored.Filled.Announcement
    "media" -> Icons.Default.PhotoLibrary
    "users" -> Icons.Default.Group
    "settings" -> Icons.Default.Settings
    "profile" -> Icons.Default.Tune
    "recycle_bin" -> Icons.Default.DeleteSweep
    "backup" -> Icons.Default.Backup
    else -> Icons.Default.Checklist
}

fun toneColor(tone: StatusTone): Color = when (tone) {
    StatusTone.INFO -> IERPBlue
    StatusTone.WARNING -> Color(0xFFD97706)
    StatusTone.SUCCESS -> Color(0xFF059669)
    StatusTone.DANGER -> Color(0xFFDC2626)
    StatusTone.NEUTRAL -> Color(0xFF64748B)
}

@Composable
fun StatusChip(status: String, modifier: Modifier = Modifier) {
    val tone = Presentation.statusTone(status)
    val color = toneColor(tone)
    Surface(modifier = modifier, color = color.copy(alpha = 0.11f), shape = CircleShape) {
        Text(
            Presentation.statusLabel(status).ifBlank { "未设置" },
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            color = color,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
fun MetricTile(
    title: String,
    value: String,
    detail: String,
    icon: ImageVector,
    tone: StatusTone,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val color = toneColor(tone)
    Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().sizeIn(minHeight = 138.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Box(
                Modifier.size(40.dp).background(color.copy(alpha = 0.11f), RoundedCornerShape(11.dp)),
                contentAlignment = Alignment.Center
            ) { androidx.compose.material3.Icon(icon, null, tint = color, modifier = Modifier.size(21.dp)) }
            Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
            Text(detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
fun PanelCard(
    title: String,
    subtitle: String = "",
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            content()
        }
    }
}

@Composable
fun SectionTitle(title: String, subtitle: String = "") {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
            if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.weight(1f))
    }
}

@Composable
fun IERPEmptyState(title: String, message: String, icon: ImageVector) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 56.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(Modifier.size(68.dp).background(IERPBlue.copy(alpha = 0.1f), RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
            androidx.compose.material3.Icon(icon, null, tint = IERPBlue, modifier = Modifier.size(32.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
