package cn.i2000.ierp.ui

import cn.i2000.ierp.data.BusinessModule
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.abs

enum class StatusTone { INFO, WARNING, SUCCESS, DANGER, NEUTRAL }

object Presentation {
    fun progress(value: JsonElement?): Int = value?.jsonPrimitive?.doubleOrNull?.toInt()?.coerceIn(0, 100) ?: 0

    fun statusTone(status: String): StatusTone = when (status.lowercase()) {
        "active", "in_progress", "in progress", "进行中", "已启动", "在建" -> StatusTone.INFO
        "pending", "waiting", "draft", "待启动", "待审批", "待处理", "待生产" -> StatusTone.WARNING
        "completed", "approved", "instock", "shipped", "已完成", "已竣工", "已批准", "已入库", "已发货" -> StatusTone.SUCCESS
        "blocked", "rejected", "returned", "逾期", "阻塞", "已拒绝", "退回" -> StatusTone.DANGER
        else -> StatusTone.NEUTRAL
    }

    fun statusLabel(status: String): String = mapOf(
        "Active" to "进行中", "Pending" to "待启动", "Completed" to "已完成",
        "IN_PROGRESS" to "进行中", "PENDING" to "待处理", "COMPLETED" to "已完成", "BLOCKED" to "阻塞",
        "Draft" to "草稿", "Approved" to "已批准", "Rejected" to "已拒绝", "Returned" to "已退回",
        "Waiting" to "待生产", "InStock" to "已入库", "Shipped" to "已发货"
    )[status] ?: status

    fun projectBusinessStatus(record: JsonObject): String {
        val nodes = (record["nodes"] as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
        fun JsonObject.text(key: String) = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
        val cost = nodes.firstOrNull { it.text("title").trim().contains("核算成本支出") }
        if (cost != null) {
            if (cost.text("status") == "COMPLETED") return "Completed"
        } else if (display(record["status"]) == "Completed") return "Completed"
        val contract = nodes.firstOrNull {
            val source = "${it.text("title")} ${it.text("phase")} ${it.text("description")}"
            source.contains("合同") || source.contains("招标投标")
        }
        if (contract != null && contract.text("status") != "COMPLETED") return "Pending"
        if (contract == null && display(record["status"]) == "Pending") return "Pending"
        return "Active"
    }

    fun projectBusinessStatusLabel(record: JsonObject): String = when (projectBusinessStatus(record)) {
        "Completed" -> "已竣工"
        "Pending" -> "待启动"
        else -> "在建"
    }

    fun moduleSubtitle(module: BusinessModule): String = when (module.id) {
        "projects" -> "厨房设备工程全生命周期管理"
        "clients" -> "客户单位、地址与联系人"
        "equipment" -> "设备型号、规格与技术参数"
        "schedule" -> "会议、现场与交付提醒"
        "docs" -> "制度、资料与常用文档"
        "archives" -> "合同、验收、图纸与结算资料"
        "production" -> "生产清单、入库与发货状态"
        "payments" -> "合同金额、开票与回款进度"
        "approvals" -> "申请、会签与审批执行状态"
        "worklogs" -> "工作内容、项目与工时记录"
        "messages" -> "团队消息与工程协作"
        "channels" -> "沟通频道与成员范围"
        "email_configs" -> "企业邮箱连接配置"
        "mail" -> "收发业务邮件与附件"
        "announcements" -> "团队公告与置顶通知"
        "media" -> "工程全过程照片与视频"
        "users" -> "账号、部门、角色与权限"
        "settings" -> "系统名称、标志与访问地址"
        "profile" -> "主题、通知与个人设置"
        "recycle_bin" -> "恢复或永久删除业务记录"
        "backup" -> "备份、恢复与维护任务"
        else -> "业务数据与协作"
    }

    fun summaryKeys(module: BusinessModule): List<String> = when (module.id) {
        "projects" -> listOf("clientName", "manager", "deadline")
        "clients" -> listOf("type", "address")
        "equipment" -> listOf("model", "brand", "dimensions")
        "schedule" -> listOf("date", "time", "assignee")
        "docs" -> listOf("category", "fileType", "size")
        "archives", "media" -> listOf("projectName", "category", "uploadDate")
        "production" -> listOf("projectCode", "managerName")
        "payments" -> listOf("managerName", "contractAmount", "receivedAmount")
        "approvals" -> listOf("applicantName", "type", "createdAt")
        "worklogs" -> listOf("projectName", "date", "duration")
        "messages" -> listOf("senderName", "timestamp")
        "channels" -> listOf("type", "projectName")
        "email_configs" -> listOf("displayName", "imapHost")
        "mail" -> listOf("from", "date")
        "announcements" -> listOf("creatorName", "createdAt")
        "users" -> listOf("department", "role", "permission")
        "settings" -> listOf("erpBaseUrl")
        "recycle_bin" -> listOf("resource", "deletedAt", "deletedByName")
        "backup" -> listOf("type", "status", "createdAt")
        else -> emptyList()
    }

    fun fieldLabel(key: String): String = mapOf(
        "clientName" to "客户", "manager" to "负责人", "deadline" to "交付", "type" to "类型",
        "address" to "地址", "model" to "型号", "brand" to "品牌", "dimensions" to "尺寸",
        "date" to "日期", "time" to "时间", "assignee" to "负责人", "category" to "分类",
        "fileType" to "格式", "size" to "大小", "projectName" to "工程", "uploadDate" to "上传",
        "projectCode" to "工程编号", "managerName" to "项目经理", "contractAmount" to "合同金额",
        "receivedAmount" to "已回款", "applicantName" to "申请人", "createdAt" to "创建",
        "duration" to "工时", "senderName" to "发送人", "timestamp" to "时间", "displayName" to "名称",
        "imapHost" to "服务器", "from" to "发件人", "creatorName" to "发布人", "department" to "部门",
        "role" to "角色", "permission" to "权限", "erpBaseUrl" to "系统地址", "resource" to "来源",
        "deletedAt" to "删除时间", "deletedByName" to "删除人"
    )[key] ?: key

    fun display(value: JsonElement?): String = value?.jsonPrimitive?.contentOrNull.orEmpty()

    fun currency(value: JsonElement?): String {
        val amount = value?.jsonPrimitive?.doubleOrNull ?: 0.0
        return if (abs(amount) >= 10_000) "¥%.1f万".format(amount / 10_000) else "¥%.0f".format(amount)
    }
}
