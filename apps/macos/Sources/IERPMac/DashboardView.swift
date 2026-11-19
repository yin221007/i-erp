import SwiftUI

struct DashboardView: View {
    let projects: [ResourceRecord]
    let user: IERPUser?
    let open: (IERPModule) -> Void

    private var active: [ResourceRecord] { projects.filter { Presentation.projectBusinessStatus($0) == "Active" } }
    private var pending: [ResourceRecord] { projects.filter { Presentation.projectBusinessStatus($0) == "Pending" } }
    private var completed: [ResourceRecord] { projects.filter { Presentation.projectBusinessStatus($0) == "Completed" } }
    private var risky: [ResourceRecord] {
        projects.filter { !($0.values["keyRisks"]?.stringValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }
    private var average: Int {
        guard !projects.isEmpty else { return 0 }
        return projects.reduce(0) { $0 + Presentation.progress($1.values["progress"]) } / projects.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("我的首页").font(.system(size: 30, weight: .black, design: .rounded))
                        Text("当前看板按账号权限展示 · \(user?.displayName ?? "当前用户") / \(user?.department ?? "")")
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Label("已连接", systemImage: "checkmark.circle.fill")
                        .font(.caption.bold()).foregroundStyle(.green)
                        .padding(.horizontal, 11).padding(.vertical, 7)
                        .background(.green.opacity(0.1), in: Capsule())
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                    MetricCard(title: "在建工程", value: "\(active.count)", detail: "待启动 \(pending.count) · 已竣工 \(completed.count)", icon: "building.2.fill", tone: .info) { open(.projects) }
                    MetricCard(title: "平均进度", value: "\(average)%", detail: "按可见工程统计", icon: "chart.line.uptrend.xyaxis", tone: .success) { open(.projects) }
                    MetricCard(title: "风险提醒", value: "\(risky.count)", detail: risky.isEmpty ? "暂无已登记风险" : "需要及时跟进", icon: "exclamationmark.triangle.fill", tone: risky.isEmpty ? .success : .danger) { open(.projects) }
                    MetricCard(title: "业务入口", value: "待办", detail: "审批 · 日程 · 工作记录", icon: "checklist", tone: .warning) { open(.approvals) }
                }

                HStack(alignment: .top, spacing: 14) {
                    IERPPanel("工程概览", subtitle: "可见工程的当前执行进度") {
                        VStack(spacing: 13) {
                            ForEach(Array(projects.sorted { Presentation.progress($0.values["progress"]) < Presentation.progress($1.values["progress"]) }.prefix(6))) { project in
                                Button { open(.projects) } label: {
                                    VStack(alignment: .leading, spacing: 7) {
                                        HStack {
                                            Text(project.title).font(.system(size: 12, weight: .semibold)).lineLimit(1)
                                            Spacer()
                                            Text("\(Presentation.progress(project.values["progress"]))%")
                                                .font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(IERPColors.primary)
                                        }
                                        IERPProgressBar(value: Presentation.progress(project.values["progress"]))
                                    }
                                }.buttonStyle(.plain)
                            }
                            if projects.isEmpty { Text("暂无可见工程").foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 130) }
                        }
                    }
                    .frame(maxWidth: .infinity)

                    IERPPanel("工程状态", subtitle: "按业务状态汇总") {
                        VStack(spacing: 15) {
                            DashboardStatusRow(label: "在建", value: active.count, color: IERPColors.primary)
                            DashboardStatusRow(label: "待启动", value: pending.count, color: .orange)
                            DashboardStatusRow(label: "已竣工", value: completed.count, color: .green)
                            Divider()
                            Button("查看全部工程") { open(.projects) }.buttonStyle(.borderedProminent)
                        }
                    }
                    .frame(width: 270)
                }

                IERPPanel("风险预警列表", subtitle: "来自工程记录中的关键风险") {
                    if risky.isEmpty {
                        Label("当前没有已登记的工程风险", systemImage: "checkmark.shield.fill")
                            .foregroundStyle(.green).frame(maxWidth: .infinity, minHeight: 90)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(risky.prefix(8))) { project in
                                Button { open(.projects) } label: {
                                    HStack(spacing: 12) {
                                        Text("高").font(.caption.bold()).foregroundStyle(.red)
                                            .frame(width: 28, height: 28).background(.red.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(project.title).font(.system(size: 12, weight: .bold))
                                            Text(project.values["keyRisks"]?.stringValue ?? "").font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                                    }
                                    .padding(.vertical, 10)
                                }.buttonStyle(.plain)
                                if project.id != risky.prefix(8).last?.id { Divider() }
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
        .background(IERPColors.canvas)
    }
}

private struct DashboardStatusRow: View {
    let label: String
    let value: Int
    let color: Color
    var body: some View {
        HStack {
            Circle().fill(color).frame(width: 9, height: 9)
            Text(label).font(.system(size: 12, weight: .semibold))
            Spacer()
            Text("\(value)").font(.system(size: 19, weight: .black, design: .rounded))
        }
    }
}
