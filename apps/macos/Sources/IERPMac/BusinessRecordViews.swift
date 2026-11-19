import SwiftUI

struct BusinessRecordList: View {
    let module: IERPModule
    let records: [ResourceRecord]
    @Binding var selection: String?
    let edit: (ResourceRecord) -> Void
    let delete: (ResourceRecord) -> Void
    let canWrite: Bool

    var body: some View {
        if records.isEmpty {
            VStack(spacing: 12) {
                Image(systemName: module.systemImage)
                    .font(.system(size: 34, weight: .light)).foregroundStyle(IERPColors.primary)
                    .frame(width: 68, height: 68).background(IERPColors.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: 18))
                Text("暂无\(module.rawValue)数据").font(.headline)
                Text("刷新页面，或使用右上角的新建与上传操作。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(IERPColors.canvas)
        } else {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: module == .projects ? 290 : 260), spacing: 14)], spacing: 14) {
                    ForEach(records) { record in
                        BusinessRecordCard(
                            module: module,
                            record: record,
                            isSelected: selection == record.id,
                            select: { selection = record.id },
                            edit: { edit(record) },
                            delete: { delete(record) },
                            canWrite: canWrite
                        )
                    }
                }
                .padding(20)
            }
            .background(IERPColors.canvas)
        }
    }
}

private struct BusinessRecordCard: View {
    let module: IERPModule
    let record: ResourceRecord
    let isSelected: Bool
    let select: () -> Void
    let edit: () -> Void
    let delete: () -> Void
    let canWrite: Bool

    private var title: String {
        module.definition?.titleKeys.compactMap { record.values[$0]?.stringValue }.first { !$0.isEmpty } ?? record.title
    }

    var body: some View {
        Button(action: select) {
            VStack(alignment: .leading, spacing: 13) {
                HStack(alignment: .top) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10).fill(IERPColors.primary.opacity(0.1))
                        Image(systemName: module.systemImage).foregroundStyle(IERPColors.primary)
                    }.frame(width: 36, height: 36)
                    Spacer()
                    if !record.status.isEmpty { StatusBadge(status: module == .projects ? Presentation.projectBusinessStatusLabel(record) : record.status) }
                }

                Text(title).font(.system(size: 15, weight: .bold)).lineLimit(2).multilineTextAlignment(.leading)

                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Presentation.summaryKeys(module).prefix(3), id: \.self) { key in
                        if let value = record.values[key], !value.cardText.isEmpty {
                            HStack(spacing: 7) {
                                Text(Presentation.fieldLabel(key)).font(.caption2.bold()).foregroundStyle(.secondary).frame(width: 50, alignment: .leading)
                                Text(key.contains("Amount") ? Presentation.currency(value) : value.cardText)
                                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                    }
                }
                .frame(minHeight: 38, alignment: .top)

                if module == .projects {
                    let progress = Presentation.progress(record.values["progress"])
                    VStack(spacing: 6) {
                        IERPProgressBar(value: progress)
                        HStack {
                            Text("工程进度").font(.caption2).foregroundStyle(.secondary)
                            Spacer()
                            Text("\(progress)%").font(.caption.bold()).foregroundStyle(IERPColors.primary)
                        }
                    }
                } else {
                    HStack {
                        Text("查看详情").font(.caption.bold()).foregroundStyle(IERPColors.primary)
                        Spacer()
                        Image(systemName: "arrow.right").font(.caption.bold()).foregroundStyle(IERPColors.primary)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: module == .projects ? 220 : 178, alignment: .topLeading)
            .background(IERPColors.panel, in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? IERPColors.primary : IERPColors.border, lineWidth: isSelected ? 2 : 1)
            }
            .shadow(color: isSelected ? IERPColors.primary.opacity(0.12) : .black.opacity(0.035), radius: 10, y: 4)
        }
        .buttonStyle(.plain)
        .contextMenu {
            if canWrite {
                Button("编辑", systemImage: "pencil", action: edit)
                Button("删除", systemImage: "trash", role: .destructive, action: delete)
            }
        }
    }
}

struct BusinessDetailView: View {
    let module: IERPModule
    let record: ResourceRecord?

    var body: some View {
        if let record {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    IERPPanel {
                        HStack(alignment: .top, spacing: 14) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 14).fill(IERPColors.primary.gradient)
                                Image(systemName: module.systemImage).font(.title2.bold()).foregroundStyle(.white)
                            }.frame(width: 54, height: 54)
                            VStack(alignment: .leading, spacing: 6) {
                                Text(recordTitle).font(.system(size: 21, weight: .black, design: .rounded)).textSelection(.enabled)
                                HStack(spacing: 8) {
                                    if !record.status.isEmpty { StatusBadge(status: module == .projects ? Presentation.projectBusinessStatusLabel(record) : record.status) }
                                    Text("编号 · \(record.id)").font(.caption2).foregroundStyle(.secondary).textSelection(.enabled)
                                }
                            }
                            Spacer()
                        }
                        if module == .projects {
                            let progress = Presentation.progress(record.values["progress"])
                            HStack { Text("工程进度").font(.caption.bold()); Spacer(); Text("\(progress)%").font(.caption.bold()).foregroundStyle(IERPColors.primary) }
                            IERPProgressBar(value: progress)
                        }
                    }

                    IERPPanel("业务详情", subtitle: "服务器中的当前记录") {
                        BusinessFieldsView(module: module, record: record)
                    }

                    if module == .approvals, record.status == "Pending" {
                        IERPPanel("审批操作") { ApprovalActionsView(record: record) }
                    }
                    if module == .production {
                        IERPPanel("生产操作") { ProductionActionsView(record: record) }
                    }
                }
                .padding(20)
            }
            .background(IERPColors.canvas)
        } else {
            VStack(spacing: 13) {
                Image(systemName: "rectangle.and.hand.point.up.left")
                    .font(.system(size: 34, weight: .light)).foregroundStyle(IERPColors.primary)
                Text("选择一张卡片查看完整内容").font(.headline)
                Text("详情、附件和业务操作会显示在这里。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(IERPColors.canvas)
        }
    }

    private var recordTitle: String {
        guard let record else { return "" }
        return module.definition?.titleKeys.compactMap { record.values[$0]?.stringValue }.first { !$0.isEmpty } ?? record.title
    }
}

private struct BusinessFieldsView: View {
    @EnvironmentObject private var model: AppModel
    let module: IERPModule
    let record: ResourceRecord

    private var definitions: [FieldDefinition] {
        (module.definition?.fields ?? []).filter { $0.key != "password" && $0.key != "nodes" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(definitions) { field in
                if let value = record.values[field.key], value != .null {
                    switch value {
                    case .array(let rows):
                        BusinessArrayField(label: field.label, rows: rows, fields: field.itemFields)
                            .padding(.vertical, 10)
                    case .object:
                        EmptyView()
                    default:
                        HStack(alignment: .top, spacing: 14) {
                            Text(field.label).font(.system(size: 11, weight: .bold)).foregroundStyle(.secondary).frame(width: 86, alignment: .leading)
                            if field.key == "url", let path = value.stringValue, !path.isEmpty {
                                Button("预览或下载") { model.openAttachment(path: path, name: record.title) }.buttonStyle(.link)
                            } else {
                                Text(module == .projects && field.key == "status" ? Presentation.projectBusinessStatusLabel(record) : (field.key.contains("Amount") ? Presentation.currency(value) : value.cardText))
                                    .font(.system(size: 12, weight: .medium)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .padding(.vertical, 7)
                        Divider().opacity(0.45)
                    }
                }
            }
        }

        if module == .projects { ProjectWorkflow(record: record) }
    }
}

private struct BusinessArrayField: View {
    @EnvironmentObject private var model: AppModel
    let label: String
    let rows: [JSONValue]
    let fields: [FieldDefinition]

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text(label).font(.system(size: 12, weight: .bold))
                Spacer()
                Text("\(rows.count) 项").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                if case .object(let object) = row {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(fields.filter { $0.key != "id" && $0.key != "password" }.prefix(6)) { field in
                            if let value = object[field.key], !value.cardText.isEmpty {
                                HStack(alignment: .top) {
                                    Text(field.label).font(.caption2.bold()).foregroundStyle(.secondary).frame(width: 74, alignment: .leading)
                                    if field.key == "url", let path = value.stringValue {
                                        Button("打开附件") { model.openAttachment(path: path, name: object["name"]?.stringValue ?? "附件") }.buttonStyle(.link)
                                    } else {
                                        Text(value.cardText).font(.caption).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                        }
                    }
                    .padding(11)
                    .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 10))
                } else {
                    Text("\(index + 1). \(row.cardText)").font(.caption)
                }
            }
        }
    }
}

private struct ProjectWorkflow: View {
    let record: ResourceRecord

    private var nodes: [[String: JSONValue]] {
        guard case .array(let rows) = record.values["nodes"] else { return [] }
        return rows.compactMap { if case .object(let value) = $0 { value } else { nil } }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack {
                Text("执行流程").font(.system(size: 14, weight: .bold))
                Spacer()
                Text("\(nodes.filter { $0["status"]?.stringValue == "COMPLETED" }.count) / \(nodes.count) 已完成")
                    .font(.caption).foregroundStyle(.secondary)
            }
            ForEach(Array(nodes.enumerated()), id: \.offset) { index, node in
                let status = node["status"]?.stringValue ?? "PENDING"
                HStack(alignment: .top, spacing: 11) {
                    ZStack {
                        Circle().fill(IERPColors.color(for: Presentation.statusTone(status)).opacity(0.14))
                        if status == "COMPLETED" {
                            Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(.green)
                        } else {
                            Text("\(index + 1)").font(.caption2.bold()).foregroundStyle(IERPColors.color(for: Presentation.statusTone(status)))
                        }
                    }.frame(width: 28, height: 28)
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(node["title"]?.stringValue ?? "流程节点").font(.system(size: 12, weight: .bold))
                            Spacer()
                            StatusBadge(status: status)
                        }
                        let phase = node["phase"]?.stringValue ?? ""
                        let assignee = node["assignee"]?.stringValue ?? ""
                        let deadline = node["deadline"]?.stringValue ?? ""
                        let meta = [phase, assignee.isEmpty ? "" : "负责人 \(assignee)", deadline.isEmpty ? "" : "截止 \(deadline)"].filter { !$0.isEmpty }.joined(separator: " · ")
                        if !meta.isEmpty { Text(meta).font(.caption2).foregroundStyle(.secondary) }
                        if let description = node["description"]?.stringValue, !description.isEmpty {
                            Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                        }
                        if case .array(let attachments) = node["attachments"], !attachments.isEmpty {
                            Label("\(attachments.count) 个附件", systemImage: "paperclip").font(.caption2).foregroundStyle(IERPColors.primary)
                        }
                    }
                }
                .padding(11)
                .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 11))
            }
        }
        .padding(.top, 14)
    }
}

private extension JSONValue {
    var cardText: String {
        switch self {
        case .string(let value): value
        case .number(let value): value.rounded() == value ? String(Int(value)) : String(value)
        case .boolean(let value): value ? "是" : "否"
        case .null: ""
        case .array(let values): "\(values.count) 项"
        case .object: "详细信息"
        }
    }
}
