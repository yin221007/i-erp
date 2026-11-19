import Foundation

struct IERPUser: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var username: String = ""
    var nickname: String = ""
    var department: String = ""
    var role: String = ""
    var permission: String = "ReadOnly"
    var isDefaultAdmin: Bool = false
    var preferences: [String: JSONValue] = [:]

    var displayName: String { nickname.isEmpty ? username : nickname }

    private enum CodingKeys: String, CodingKey {
        case id, username, nickname, department, role, permission, isDefaultAdmin, preferences
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        username = try container.decodeIfPresent(String.self, forKey: .username) ?? ""
        nickname = try container.decodeIfPresent(String.self, forKey: .nickname) ?? ""
        department = try container.decodeIfPresent(String.self, forKey: .department) ?? ""
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? ""
        permission = try container.decodeIfPresent(String.self, forKey: .permission) ?? "ReadOnly"
        isDefaultAdmin = try container.decodeIfPresent(Bool.self, forKey: .isDefaultAdmin) ?? false
        preferences = try container.decodeIfPresent([String: JSONValue].self, forKey: .preferences) ?? [:]
    }
}

struct LoginRequest: Encodable, Sendable {
    let username: String
    let password: String
    let persistent = true
}

struct LoginResponse: Decodable, Sendable {
    let user: IERPUser
}

struct CurrentUserResponse: Decodable, Sendable {
    let user: IERPUser
}

enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case boolean(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .boolean(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else { self = .array(try container.decode([JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .boolean(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    var boolValue: Bool? {
        if case .boolean(let value) = self { return value }
        return nil
    }

    var numberValue: Double? {
        if case .number(let value) = self { return value }
        return nil
    }
}

struct ResourceRecord: Codable, Identifiable, Hashable, Sendable {
    let values: [String: JSONValue]

    init(values: [String: JSONValue]) {
        self.values = values
    }

    init(from decoder: Decoder) throws {
        values = try decoder.singleValueContainer().decode([String: JSONValue].self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(values)
    }

    var id: String { values["id"]?.stringValue ?? "" }
    var title: String {
        values["name"]?.stringValue
            ?? values["projectName"]?.stringValue
            ?? values["title"]?.stringValue
            ?? "未命名记录"
    }
    var status: String { values["status"]?.stringValue ?? "" }
}

enum IERPModule: String, CaseIterable, Identifiable, Hashable, Sendable {
    case dashboard = "首页"
    case projects = "项目管理"
    case clients = "客户管理"
    case equipment = "设备管理"
    case schedule = "日程管理"
    case docs = "文档中心"
    case archives = "工程档案"
    case production = "生产管理"
    case payments = "回款管理"
    case approvals = "审批中心"
    case worklogs = "工作日志"
    case messages = "即时沟通"
    case channels = "频道管理"
    case email = "邮箱设置"
    case mail = "业务邮箱"
    case announcements = "公告管理"
    case media = "现场照片与视频"
    case users = "用户管理"
    case settings = "系统设置"
    case profile = "个人偏好"
    case recycleBin = "回收站"
    case backup = "备份与恢复"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .dashboard: "house"
        case .projects: "building.2"
        case .clients: "person.2"
        case .equipment: "shippingbox"
        case .schedule: "calendar"
        case .docs: "doc.text"
        case .archives: "archivebox"
        case .production: "gearshape.2"
        case .payments: "yensign.circle"
        case .approvals: "checkmark.seal"
        case .worklogs: "square.and.pencil"
        case .messages: "bubble.left.and.bubble.right"
        case .channels: "number"
        case .email: "envelope"
        case .mail: "tray.full"
        case .announcements: "megaphone"
        case .media: "photo.on.rectangle.angled"
        case .users: "person.crop.circle.badge.gearshape"
        case .settings: "gear"
        case .profile: "person.crop.circle"
        case .recycleBin: "trash"
        case .backup: "externaldrive.badge.timemachine"
        }
    }

    var definition: ModuleDefinition? { ModuleDefinitions.all[self] }
}

enum FieldKind: Sendable { case text, multiline, number, boolean, date, choice, list, password }

struct FieldDefinition: Identifiable, Sendable {
    let key: String
    let label: String
    var kind: FieldKind = .text
    var required = false
    var hint = ""
    var choices: [String] = []
    var itemFields: [FieldDefinition] = []
    var id: String { key }
}

struct ModuleDefinition: Sendable {
    let resource: String
    let titleKeys: [String]
    let fields: [FieldDefinition]
    var readOnly = false
    var administratorOnly = false
}

enum ModuleDefinitions {
    private static func text(_ key: String, _ label: String, required: Bool = false) -> FieldDefinition {
        FieldDefinition(key: key, label: label, required: required)
    }
    private static func long(_ key: String, _ label: String) -> FieldDefinition {
        FieldDefinition(key: key, label: label, kind: .multiline)
    }
    private static func number(_ key: String, _ label: String) -> FieldDefinition {
        FieldDefinition(key: key, label: label, kind: .number)
    }
    private static func bool(_ key: String, _ label: String) -> FieldDefinition {
        FieldDefinition(key: key, label: label, kind: .boolean)
    }
    private static func date(_ key: String, _ label: String) -> FieldDefinition {
        FieldDefinition(key: key, label: label, kind: .date)
    }
    private static func choice(_ key: String, _ label: String, _ values: [String]) -> FieldDefinition {
        FieldDefinition(key: key, label: label, kind: .choice, choices: values)
    }
    private static func list(_ key: String, _ label: String, _ fields: [FieldDefinition]) -> FieldDefinition {
        FieldDefinition(key: key, label: label, kind: .list, itemFields: fields)
    }
    private static func password(_ key: String, _ label: String) -> FieldDefinition {
        FieldDefinition(key: key, label: label, kind: .password)
    }

    static let all: [IERPModule: ModuleDefinition] = [
        .projects: .init(resource: "projects", titleKeys: ["name"], fields: [
            text("name", "工程名称", required: true), text("internalContractNo", "内部合同号"),
            text("clientName", "客户名称", required: true), text("manager", "项目经理", required: true),
            date("startDate", "开始日期"), date("deadline", "计划完成日期"), text("status", "状态"),
            number("progress", "进度（0-100）"), long("keyRisks", "关键风险"),
            date("currentPhaseDeadline", "当前阶段期限"), list("nodes", "执行流程", [
                text("title", "节点名称", required: true), text("phase", "阶段"),
                choice("status", "状态", ["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED"]),
                text("assignee", "负责人"), date("deadline", "截止日期"), long("description", "说明")
            ])
        ]),
        .clients: .init(resource: "clients", titleKeys: ["companyName", "name"], fields: [
            text("companyName", "单位名称", required: true), text("address", "地址"),
            choice("type", "客户类型", ["Hotel", "Restaurant", "Canteen", "Government", "SchoolCanteen", "SOE", "Private", "Other"]),
            list("contacts", "联系人", [text("name", "姓名", required: true), text("role", "职务"), text("phone", "电话"), text("email", "邮箱")])
        ]),
        .equipment: .init(resource: "equipment", titleKeys: ["name"], fields: [
            text("name", "设备名称", required: true), text("model", "型号"), text("brand", "品牌"),
            text("category", "分类"), text("dimensions", "尺寸"), text("powerSpecs", "电气参数"),
            text("waterGasSpecs", "水气参数"), long("description", "说明"), text("imageUrl", "图片地址")
        ]),
        .schedule: .init(resource: "schedule", titleKeys: ["title"], fields: [
            text("title", "标题", required: true), date("date", "日期"), text("time", "时间"),
            text("type", "类型"), text("projectId", "工程编号"), text("assignee", "负责人"),
            bool("isCompleted", "已完成")
        ]),
        .docs: .init(resource: "docs", titleKeys: ["title"], fields: [
            text("title", "标题", required: true), text("category", "分类"), text("fileType", "文件类型"),
            text("size", "大小"), text("url", "文件地址"), long("content", "内容")
        ]),
        .archives: .init(resource: "archives", titleKeys: ["title"], fields: [
            text("title", "标题", required: true), text("category", "档案分类", required: true),
            text("projectId", "工程编号"), text("projectName", "工程名称"), text("fileType", "文件类型"),
            text("size", "大小"), text("url", "文件地址"), date("uploadDate", "上传日期"),
            long("description", "说明")
        ]),
        .production: .init(resource: "production", titleKeys: ["projectName"], fields: [
            text("projectId", "工程编号", required: true), text("projectName", "工程名称", required: true),
            text("projectCode", "工程编码"), list("items", "生产清单", [
                text("serialNumber", "编号 / 序号"), text("name", "设备名称", required: true),
                text("model", "清单规格 / 型号"), text("actualProductionSpec", "实际生产规格"), number("quantity", "数量"),
                choice("status", "状态", ["Waiting", "InStock", "Shipped"]), date("batchDate", "批次日期"), long("notes", "备注")
            ])
        ]),
        .payments: .init(resource: "payments", titleKeys: ["projectName"], fields: [
            text("projectId", "工程编号"), text("projectName", "工程名称", required: true),
            text("managerName", "项目经理"), text("clientContactName", "客户联系人"),
            number("contractAmount", "合同金额"), number("variationAmount", "增补金额"),
            number("submissionAmount", "送审金额"), number("auditedAmount", "审定金额"),
            long("paymentTerms", "付款条款"), number("receivedAmount", "已回款"),
            date("finalPaymentDueDate", "尾款到期日"), number("invoicedAmount", "已开票金额"),
            text("warrantyPeriod", "质保期")
        ]),
        .approvals: .init(resource: "approvals", titleKeys: ["title"], fields: [
            text("title", "标题", required: true), text("type", "审批类型"), text("status", "状态"),
            text("applicantId", "申请人编号"), text("applicantName", "申请人"), long("currentContent", "申请内容"),
            choice("strategy", "审批方式", ["SEQUENTIAL", "PARALLEL", "JOINT", "OR_SIGN"]),
            list("approverIds", "审批人", [text("value", "用户编号", required: true)]),
            list("currentAttachments", "申请附件", [
                text("name", "附件名称", required: true), text("url", "文件地址", required: true),
                text("type", "类型"), text("size", "大小"), date("uploadDate", "上传日期")
            ])
        ]),
        .worklogs: .init(resource: "worklogs", titleKeys: ["title", "content"], fields: [
            text("title", "标题"), date("date", "日期"), text("projectId", "工程编号"),
            text("projectName", "工程名称"), long("content", "工作内容"), number("duration", "工时")
        ]),
        .messages: .init(resource: "messages", titleKeys: ["content", "senderName"], fields: [
            text("channelId", "频道编号", required: true), long("content", "消息内容")
        ]),
        .channels: .init(resource: "channels", titleKeys: ["name"], fields: [
            text("name", "频道名称", required: true), choice("type", "频道类型", ["General", "Project", "Group", "Private"]),
            text("projectId", "工程编号"), list("participants", "成员", [text("value", "用户编号", required: true)])
        ]),
        .email: .init(resource: "email_configs", titleKeys: ["email", "name"], fields: [
            text("email", "邮箱地址", required: true), FieldDefinition(key: "authCode", label: "邮箱授权码", kind: .password, required: true), text("imapHost", "IMAP 主机"),
            number("imapPort", "IMAP 端口"), text("smtpHost", "SMTP 主机"), number("smtpPort", "SMTP 端口"),
            text("displayName", "发件人名称")
        ]),
        .announcements: .init(resource: "announcements", titleKeys: ["title"], fields: [
            text("title", "标题", required: true), long("content", "公告内容"), text("channelId", "频道编号"), bool("isPinned", "置顶")
        ]),
        .users: .init(resource: "users", titleKeys: ["nickname", "username"], fields: [
            text("nickname", "姓名", required: true), text("username", "账号"), password("password", "密码"),
            text("department", "部门"), text("role", "角色"), text("permission", "权限"), text("avatar", "头像")
        ], administratorOnly: true),
        .settings: .init(resource: "settings", titleKeys: ["appName"], fields: [
            text("appName", "系统名称"), text("logoUrl", "标志地址"), number("logoWidth", "标志宽度"),
            text("poweredByText", "版权文字"), text("erpBaseUrl", "系统地址")
        ], administratorOnly: true),
        .media: .init(resource: "archives", titleKeys: ["title", "projectName"], fields: [], readOnly: true),
        .recycleBin: .init(resource: "recycle_bin", titleKeys: ["name", "title", "resource"], fields: [], readOnly: true)
    ]
}
