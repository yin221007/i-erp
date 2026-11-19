package cn.i2000.ierp.data

enum class FieldKind { TEXT, MULTILINE, NUMBER, BOOLEAN, DATE, CHOICE, LIST, PASSWORD }

data class FieldDefinition(
    val key: String,
    val label: String,
    val kind: FieldKind = FieldKind.TEXT,
    val required: Boolean = false,
    val hint: String = "",
    val choices: List<String> = emptyList(),
    val itemFields: List<FieldDefinition> = emptyList()
)

data class BusinessModule(
    val resource: String,
    val title: String,
    val titleKeys: List<String>,
    val fields: List<FieldDefinition>,
    val readOnly: Boolean = false,
    val administratorOnly: Boolean = false,
    val id: String = resource,
    val filter: ((kotlinx.serialization.json.JsonObject) -> Boolean)? = null
)

object BusinessModules {
    private fun text(key: String, label: String, required: Boolean = false) =
        FieldDefinition(key, label, FieldKind.TEXT, required)
    private fun long(key: String, label: String) = FieldDefinition(key, label, FieldKind.MULTILINE)
    private fun number(key: String, label: String) = FieldDefinition(key, label, FieldKind.NUMBER)
    private fun bool(key: String, label: String) = FieldDefinition(key, label, FieldKind.BOOLEAN)
    private fun date(key: String, label: String) = FieldDefinition(key, label, FieldKind.DATE)
    private fun choice(key: String, label: String, vararg values: String) =
        FieldDefinition(key, label, FieldKind.CHOICE, choices = values.toList())
    private fun list(key: String, label: String, vararg fields: FieldDefinition) =
        FieldDefinition(key, label, FieldKind.LIST, itemFields = fields.toList())

    val all = listOf(
        BusinessModule("projects", "项目管理", listOf("name"), listOf(
            text("name", "工程名称", true), text("internalContractNo", "内部合同号"),
            text("clientName", "客户名称", true), text("manager", "项目经理", true),
            date("startDate", "开始日期"), date("deadline", "计划完成日期"),
            choice("status", "状态", "Active", "Pending", "Completed"), number("progress", "进度（0-100）"),
            long("keyRisks", "关键风险"), date("currentPhaseDeadline", "当前阶段期限"),
            list("nodes", "执行流程",
                text("title", "节点名称", true), text("phase", "阶段"),
                choice("status", "状态", "PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED"),
                text("assignee", "负责人"), date("deadline", "截止日期"), long("description", "说明")
            )
        )),
        BusinessModule("clients", "客户管理", listOf("companyName", "name"), listOf(
            text("companyName", "单位名称", true), text("address", "地址"),
            choice("type", "客户类型", "Hotel", "Restaurant", "Canteen", "Government", "SchoolCanteen", "SOE", "Private", "Other"),
            list("contacts", "联系人", text("name", "姓名", true), text("role", "职务"), text("phone", "电话"), text("email", "邮箱"))
        )),
        BusinessModule("equipment", "设备管理", listOf("name"), listOf(
            text("name", "设备名称", true), text("model", "型号"), text("brand", "品牌"),
            text("category", "分类"), text("dimensions", "尺寸"), text("powerSpecs", "电气参数"),
            text("waterGasSpecs", "水气参数"), long("description", "说明"), text("imageUrl", "图片地址")
        )),
        BusinessModule("schedule", "日程管理", listOf("title"), listOf(
            text("title", "标题", true), date("date", "日期"), text("time", "时间"),
            choice("type", "类型", "Meeting", "SiteVisit", "Deadline", "Other"), text("projectId", "工程编号"), text("assignee", "负责人"),
            bool("isCompleted", "已完成")
        )),
        BusinessModule("docs", "文档中心", listOf("title"), listOf(
            text("title", "标题", true), text("category", "分类"), text("fileType", "文件类型"),
            text("size", "大小"), text("url", "文件地址"), long("content", "内容")
        )),
        BusinessModule("archives", "工程档案", listOf("title"), listOf(
            text("title", "标题", true), text("category", "档案分类", true),
            text("projectId", "工程编号"), text("projectName", "工程名称"), text("fileType", "文件类型"),
            text("size", "大小"), text("url", "文件地址"), date("uploadDate", "上传日期"),
            long("description", "说明")
        ), filter = { row -> row["category"]?.toString()?.trim('"') != "Media" }),
        BusinessModule("production", "生产管理", listOf("projectName"), listOf(
            text("projectId", "工程编号", true), text("projectName", "工程名称", true),
            text("projectCode", "工程编码"), list("items", "生产清单",
                text("serialNumber", "编号 / 序号"), text("name", "设备名称", true),
                text("model", "清单规格 / 型号"), text("actualProductionSpec", "实际生产规格"), number("quantity", "数量"),
                choice("status", "状态", "Waiting", "InStock", "Shipped"), date("batchDate", "批次日期"), long("notes", "备注")
            )
        )),
        BusinessModule("payments", "回款管理", listOf("projectName"), listOf(
            text("projectId", "工程编号"), text("projectName", "工程名称", true),
            text("managerName", "项目经理"), text("clientContactName", "客户联系人"),
            number("contractAmount", "合同金额"), number("variationAmount", "增补金额"),
            number("submissionAmount", "送审金额"), number("auditedAmount", "审定金额"),
            long("paymentTerms", "付款条款"), number("receivedAmount", "已回款"),
            date("finalPaymentDueDate", "尾款到期日"), number("invoicedAmount", "已开票金额"),
            text("warrantyPeriod", "质保期")
        )),
        BusinessModule("approvals", "审批中心", listOf("title"), listOf(
            text("title", "标题", true), choice("type", "审批类型", "Procurement", "Expense", "Leave", "Engineering", "Deletion", "Other"),
            choice("status", "状态", "Draft", "Pending", "Approved", "Rejected", "Returned"),
            text("applicantId", "申请人编号"), text("applicantName", "申请人"), long("currentContent", "申请内容"),
            choice("strategy", "审批方式", "SEQUENTIAL", "PARALLEL", "JOINT", "OR_SIGN"),
            list("approverIds", "审批人", text("value", "用户编号", true)),
            list("currentAttachments", "申请附件",
                text("name", "附件名称", true), text("url", "文件地址", true), text("type", "类型"),
                text("size", "大小"), date("uploadDate", "上传日期")
            )
        )),
        BusinessModule("worklogs", "工作日志", listOf("title", "content"), listOf(
            text("title", "标题"), date("date", "日期"), text("projectId", "工程编号"),
            text("projectName", "工程名称"), long("content", "工作内容"), number("duration", "工时"),
            choice("status", "出勤状态", "Present", "Leave", "Sick", "BusinessTrip", "Remote", "PublicHoliday", "Vacation", "Outsourced")
        )),
        BusinessModule("messages", "即时沟通", listOf("content", "senderName"), listOf(
            text("channelId", "频道编号", true), long("content", "消息内容")
        )),
        BusinessModule("channels", "频道管理", listOf("name"), listOf(
            text("name", "频道名称", true), choice("type", "频道类型", "General", "Project", "Group", "Private"),
            text("projectId", "工程编号"), list("participants", "成员", text("value", "用户编号", true))
        )),
        BusinessModule("email_configs", "邮箱设置", listOf("email", "name"), listOf(
            text("email", "邮箱地址", true), FieldDefinition("authCode", "邮箱授权码", FieldKind.PASSWORD, required = true), text("imapHost", "IMAP 主机"),
            number("imapPort", "IMAP 端口"), text("smtpHost", "SMTP 主机"), number("smtpPort", "SMTP 端口"),
            text("displayName", "发件人名称")
        )),
        BusinessModule("announcements", "公告管理", listOf("title"), listOf(
            text("title", "标题", true), long("content", "公告内容"), text("channelId", "频道编号"), bool("isPinned", "置顶")
        )),
        BusinessModule("users", "用户管理", listOf("nickname", "username"), listOf(
            text("nickname", "姓名", true), text("username", "账号"),
            FieldDefinition("password", "密码", FieldKind.PASSWORD), text("department", "部门"),
            text("role", "角色"), text("permission", "权限"), text("avatar", "头像")
        ), administratorOnly = true),
        BusinessModule("settings", "系统设置", listOf("appName"), listOf(
            text("appName", "系统名称"), text("logoUrl", "标志地址"), number("logoWidth", "标志宽度"),
            text("poweredByText", "版权文字"), text("erpBaseUrl", "系统地址")
        ), administratorOnly = true),
        BusinessModule("recycle_bin", "回收站", listOf("name", "title", "resource"), emptyList(), readOnly = true),
        BusinessModule("archives", "全过程影像", listOf("title", "projectName"), emptyList(), readOnly = true,
            id = "media", filter = { row -> row["category"]?.toString()?.trim('"') == "Media" }),
        BusinessModule("", "业务邮箱", listOf("subject", "from"), emptyList(), readOnly = true, id = "mail"),
        BusinessModule("", "个人偏好", emptyList(), emptyList(), readOnly = true, id = "profile"),
        BusinessModule("", "备份与维护", listOf("id"), emptyList(), readOnly = true, administratorOnly = true, id = "backup")
    )

    fun byResource(resource: String): BusinessModule? = all.firstOrNull { it.resource == resource && it.id == resource }
    fun byId(id: String): BusinessModule? = all.firstOrNull { it.id == id }
}
