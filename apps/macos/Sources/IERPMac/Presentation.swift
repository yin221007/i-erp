import Foundation

enum StatusTone: String, Sendable {
    case info, warning, success, danger, neutral
}

enum Presentation {
    static func progress(_ value: JSONValue?) -> Int {
        min(100, max(0, Int(value?.numberValue ?? 0)))
    }

    static func statusTone(_ status: String) -> StatusTone {
        switch status.lowercased() {
        case "active", "in_progress", "in progress", "进行中", "已启动", "在建": .info
        case "pending", "waiting", "draft", "待启动", "待审批", "待处理", "待生产": .warning
        case "completed", "approved", "instock", "shipped", "已完成", "已竣工", "已批准", "已入库", "已发货": .success
        case "blocked", "rejected", "returned", "逾期", "阻塞", "已拒绝", "退回": .danger
        default: .neutral
        }
    }

    static func statusLabel(_ status: String) -> String {
        [
            "Active": "进行中", "Pending": "待启动", "Completed": "已完成",
            "IN_PROGRESS": "进行中", "PENDING": "待处理", "COMPLETED": "已完成", "BLOCKED": "阻塞",
            "Draft": "草稿", "Approved": "已批准", "Rejected": "已拒绝", "Returned": "已退回",
            "Waiting": "待生产", "InStock": "已入库", "Shipped": "已发货"
        ][status] ?? status
    }

    static func projectBusinessStatus(_ record: ResourceRecord) -> String {
        let nodes: [[String: JSONValue]]
        if case .array(let values) = record.values["nodes"] {
            nodes = values.compactMap { value in
                if case .object(let object) = value { return object }
                return nil
            }
        } else {
            nodes = []
        }
        func text(_ node: [String: JSONValue], _ key: String) -> String { node[key]?.stringValue ?? "" }
        let cost = nodes.first { text($0, "title").trimmingCharacters(in: .whitespacesAndNewlines).contains("核算成本支出") }
        if let cost { if text(cost, "status") == "COMPLETED" { return "Completed" } }
        else if record.status == "Completed" { return "Completed" }

        let contract = nodes.first { node in
            let source = "\(text(node, "title")) \(text(node, "phase")) \(text(node, "description"))"
            return source.contains("合同") || source.contains("招标投标")
        }
        if let contract, text(contract, "status") != "COMPLETED" { return "Pending" }
        if contract == nil && record.status == "Pending" { return "Pending" }
        return "Active"
    }

    static func projectBusinessStatusLabel(_ record: ResourceRecord) -> String {
        switch projectBusinessStatus(record) {
        case "Completed": "已竣工"
        case "Pending": "待启动"
        default: "在建"
        }
    }

    static func moduleSubtitle(_ module: IERPModule) -> String {
        switch module {
        case .dashboard: "汇总工程、待办、风险与业务动态"
        case .projects: "厨房设备工程全生命周期管理"
        case .clients: "客户单位、地址与联系人"
        case .equipment: "设备型号、规格与技术参数"
        case .schedule: "会议、现场与交付提醒"
        case .docs: "制度、资料与常用文档"
        case .archives: "合同、验收、图纸与结算资料"
        case .production: "生产清单、入库与发货状态"
        case .payments: "合同金额、开票与回款进度"
        case .approvals: "申请、会签与审批执行状态"
        case .worklogs: "工作内容、项目与工时记录"
        case .messages: "团队消息与工程协作"
        case .channels: "沟通频道与成员范围"
        case .email: "企业邮箱连接配置"
        case .mail: "收发业务邮件与附件"
        case .announcements: "团队公告与置顶通知"
        case .media: "工程全过程照片与视频"
        case .users: "账号、部门、角色与权限"
        case .settings: "系统名称、标志与访问地址"
        case .profile: "主题、通知与个人设置"
        case .recycleBin: "恢复或永久删除业务记录"
        case .backup: "备份、恢复与维护任务"
        }
    }

    static func summaryKeys(_ module: IERPModule) -> [String] {
        switch module {
        case .projects: ["clientName", "manager", "deadline"]
        case .clients: ["type", "address"]
        case .equipment: ["model", "brand", "dimensions"]
        case .schedule: ["date", "time", "assignee"]
        case .docs: ["category", "fileType", "size"]
        case .archives, .media: ["projectName", "category", "uploadDate"]
        case .production: ["projectCode", "managerName"]
        case .payments: ["managerName", "contractAmount", "receivedAmount"]
        case .approvals: ["applicantName", "type", "createdAt"]
        case .worklogs: ["projectName", "date", "duration"]
        case .messages: ["senderName", "timestamp"]
        case .channels: ["type", "projectName"]
        case .email: ["displayName", "imapHost"]
        case .mail: ["from", "date"]
        case .announcements: ["creatorName", "createdAt"]
        case .users: ["department", "role", "permission"]
        case .settings: ["erpBaseUrl"]
        case .recycleBin: ["resource", "deletedAt", "deletedByName"]
        case .backup: ["type", "status", "createdAt"]
        case .dashboard, .profile: []
        }
    }

    static func fieldLabel(_ key: String) -> String {
        [
            "clientName": "客户", "manager": "负责人", "deadline": "交付", "type": "类型",
            "address": "地址", "model": "型号", "brand": "品牌", "dimensions": "尺寸",
            "date": "日期", "time": "时间", "assignee": "负责人", "category": "分类",
            "fileType": "格式", "size": "大小", "projectName": "工程", "uploadDate": "上传",
            "projectCode": "工程编号", "managerName": "项目经理", "contractAmount": "合同金额",
            "receivedAmount": "已回款", "applicantName": "申请人", "createdAt": "创建",
            "duration": "工时", "senderName": "发送人", "timestamp": "时间", "displayName": "名称",
            "imapHost": "服务器", "from": "发件人", "creatorName": "发布人", "department": "部门",
            "role": "角色", "permission": "权限", "erpBaseUrl": "系统地址", "resource": "来源",
            "deletedAt": "删除时间", "deletedByName": "删除人", "status": "状态"
        ][key] ?? key
    }

    static func number(_ value: JSONValue?) -> Double {
        value?.numberValue ?? Double(value?.stringValue ?? "") ?? 0
    }

    static func currency(_ value: JSONValue?) -> String {
        let amount = number(value)
        if abs(amount) >= 10_000 { return String(format: "¥%.1f万", amount / 10_000) }
        return String(format: "¥%.0f", amount)
    }
}
