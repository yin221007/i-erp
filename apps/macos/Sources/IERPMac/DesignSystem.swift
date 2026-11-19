import SwiftUI

enum IERPColors {
    static let primary = Color(red: 37 / 255, green: 99 / 255, blue: 235 / 255)
    static let primarySoft = Color(red: 239 / 255, green: 246 / 255, blue: 255 / 255)
    static let canvas = Color(nsColor: .windowBackgroundColor).opacity(0.72)
    static let panel = Color(nsColor: .controlBackgroundColor)
    static let border = Color.primary.opacity(0.09)

    static func color(for tone: StatusTone) -> Color {
        switch tone {
        case .info: primary
        case .warning: Color(red: 217 / 255, green: 119 / 255, blue: 6 / 255)
        case .success: Color(red: 5 / 255, green: 150 / 255, blue: 105 / 255)
        case .danger: Color(red: 220 / 255, green: 38 / 255, blue: 38 / 255)
        case .neutral: .secondary
        }
    }
}

struct BrandSidebar: View {
    @Binding var selection: String
    let modules: [IERPModule]
    let user: IERPUser?
    let logout: () -> Void

    private let groups: [(String, [IERPModule])] = [
        ("核心业务", [.dashboard, .projects, .clients, .production, .approvals, .payments, .schedule, .worklogs, .mail, .messages]),
        ("数据管理", [.archives, .media, .equipment, .docs, .channels, .announcements]),
        ("系统管理", [.profile, .email, .users, .settings, .recycleBin, .backup])
    ]

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 11) {
                ZStack {
                    RoundedRectangle(cornerRadius: 11).fill(IERPColors.primary.gradient)
                    Image(systemName: "building.2.crop.circle.fill")
                        .font(.system(size: 23, weight: .semibold)).foregroundStyle(.white)
                }
                .frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 1) {
                    Text("海牛 ERP").font(.system(size: 18, weight: .black))
                    Text("核心业务").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 15)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 15) {
                    ForEach(groups, id: \.0) { title, items in
                        let visible = items.filter(modules.contains)
                        if !visible.isEmpty {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(title)
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.secondary)
                                    .tracking(1.1)
                                    .padding(.horizontal, 13)
                                ForEach(visible) { module in
                                    Button {
                                        selection = module.rawValue
                                    } label: {
                                        HStack(spacing: 11) {
                                            Image(systemName: module.systemImage)
                                                .font(.system(size: 15, weight: .semibold))
                                                .frame(width: 21)
                                            Text(module.rawValue).font(.system(size: 13, weight: .semibold))
                                            Spacer()
                                            if selection == module.rawValue {
                                                Circle().fill(IERPColors.primary).frame(width: 5, height: 5)
                                            }
                                        }
                                        .foregroundStyle(selection == module.rawValue ? IERPColors.primary : Color.primary.opacity(0.78))
                                        .padding(.horizontal, 12).frame(height: 38)
                                        .background(
                                            RoundedRectangle(cornerRadius: 10)
                                                .fill(selection == module.rawValue ? IERPColors.primary.opacity(0.12) : .clear)
                                        )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 9).padding(.vertical, 6)
            }

            Divider().opacity(0.6)
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(IERPColors.primary.opacity(0.14))
                    Text(String((user?.displayName ?? "用").prefix(1)))
                        .font(.system(size: 13, weight: .bold)).foregroundStyle(IERPColors.primary)
                }.frame(width: 34, height: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(user?.displayName ?? "当前用户").font(.system(size: 12, weight: .bold)).lineLimit(1)
                    HStack(spacing: 4) {
                        Circle().fill(.green).frame(width: 6, height: 6)
                        Text("已连接").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button(action: logout) { Image(systemName: "rectangle.portrait.and.arrow.right") }
                    .buttonStyle(.plain).foregroundStyle(.secondary).help("退出登录")
            }
            .padding(13)
        }
        .background(Color(nsColor: .underPageBackgroundColor))
    }
}

struct PageHeader<Trailing: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.system(size: 27, weight: .black, design: .rounded))
                Text(subtitle).font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 12)
            trailing()
        }
        .padding(.horizontal, 24).padding(.vertical, 18)
        .background(.thinMaterial)
        .overlay(alignment: .bottom) { Divider().opacity(0.5) }
    }
}

struct IERPPanel<Content: View>: View {
    let title: String?
    let subtitle: String?
    @ViewBuilder let content: () -> Content

    init(_ title: String? = nil, subtitle: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let title {
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 15, weight: .bold))
                    if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
                }
            }
            content()
        }
        .padding(18)
        .background(IERPColors.panel, in: RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(IERPColors.border) }
        .shadow(color: .black.opacity(0.035), radius: 9, y: 3)
    }
}

struct StatusBadge: View {
    let status: String

    var body: some View {
        let tone = Presentation.statusTone(status)
        let color = IERPColors.color(for: tone)
        Text(Presentation.statusLabel(status).isEmpty ? "未设置" : Presentation.statusLabel(status))
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(color.opacity(0.12), in: Capsule())
    }
}

struct IERPProgressBar: View {
    let value: Int

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.08))
                Capsule().fill(IERPColors.primary.gradient)
                    .frame(width: proxy.size.width * CGFloat(value) / 100)
            }
        }
        .frame(height: 7)
        .accessibilityLabel("进度 \(value)%")
    }
}

struct MetricCard: View {
    let title: String
    let value: String
    let detail: String
    let icon: String
    let tone: StatusTone
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(IERPColors.color(for: tone).opacity(0.12))
                    Image(systemName: icon).font(.system(size: 19, weight: .semibold)).foregroundStyle(IERPColors.color(for: tone))
                }.frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.system(size: 11, weight: .bold)).foregroundStyle(.secondary)
                    Text(value).font(.system(size: 25, weight: .black, design: .rounded))
                    Text(detail).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
            .background(IERPColors.panel, in: RoundedRectangle(cornerRadius: 16))
            .overlay { RoundedRectangle(cornerRadius: 16).stroke(IERPColors.border) }
        }
        .buttonStyle(.plain)
    }
}
