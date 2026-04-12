import Cocoa
import ApplicationServices
import Foundation

struct DragCheck: Codable {
  let taskTitleBefore: String?
  let taskTitleAfter: String?
  let frame: String?
  let changedAfterDrop: Bool
}

struct Summary: Codable {
  let reviewedAt: String
  let appPid: Int32
  let evidenceDir: String
  let screenshots: [String: String]
  let checks: [String: String]
  let reminderOptions: [String]
  let drag: DragCheck
  let issues: [String]
  let pass: Bool
}

let args = CommandLine.arguments
let pid = Int32(args.dropFirst().first ?? "") ?? 0
if pid <= 0 {
  fputs("missing target pid\n", stderr)
  exit(1)
}

let evidenceDir = "/Users/turbo/WorkBuddy/20260330162606/.workbuddy/browser-audit/results/2026-04-08-desktop-ux-review"
let screenshotsDir = evidenceDir + "/screenshots"
let fm = FileManager.default
try fm.createDirectory(atPath: screenshotsDir, withIntermediateDirectories: true)

func attr(_ element: AXUIElement, _ key: String) -> AnyObject? {
  var value: CFTypeRef?
  let result = AXUIElementCopyAttributeValue(element, key as CFString, &value)
  return result == .success ? (value as AnyObject?) : nil
}

func text(_ value: AnyObject?) -> String {
  if let string = value as? String { return string }
  if let number = value as? NSNumber { return number.stringValue }
  return ""
}

func children(of element: AXUIElement) -> [AXUIElement] {
  (attr(element, kAXChildrenAttribute) as? [AXUIElement]) ?? []
}

func walk(_ element: AXUIElement, visit: (AXUIElement) -> Void) {
  visit(element)
  for child in children(of: element) {
    walk(child, visit: visit)
  }
}

func waitUntil(timeout: TimeInterval = 4.0, interval: useconds_t = 180_000, _ condition: () -> Bool) -> Bool {
  let deadline = Date().addingTimeInterval(timeout)
  while Date() < deadline {
    if condition() { return true }
    usleep(interval)
  }
  return condition()
}

func run(_ launchPath: String, _ arguments: [String]) {
  let process = Process()
  process.executableURL = URL(fileURLWithPath: launchPath)
  process.arguments = arguments
  try? process.run()
  process.waitUntilExit()
}

func capture(_ name: String) -> String {
  let path = screenshotsDir + "/" + name
  run("/usr/sbin/screencapture", ["-x", path])
  usleep(250_000)
  return path
}

func activateApp() {
  if let app = NSRunningApplication(processIdentifier: pid) {
    _ = app.activate()
    usleep(600_000)
  }
}

func axApp() -> AXUIElement {
  AXUIElementCreateApplication(pid)
}

func firstWindow() -> AXUIElement? {
  let app = axApp()
  return (attr(app, kAXWindowsAttribute) as? [AXUIElement])?.first
}

func findElement(where predicate: @escaping (AXUIElement) -> Bool) -> AXUIElement? {
  guard let window = firstWindow() else { return nil }
  var found: AXUIElement?
  walk(window) { element in
    if found == nil, predicate(element) {
      found = element
    }
  }
  return found
}

func buttonTitle(_ element: AXUIElement) -> String {
  text(attr(element, kAXTitleAttribute))
}

func role(_ element: AXUIElement) -> String {
  text(attr(element, kAXRoleAttribute))
}

func allButtonTitles() -> [String] {
  guard let window = firstWindow() else { return [] }
  var titles: [String] = []
  walk(window) { element in
    let itemRole = role(element)
    guard itemRole == kAXButtonRole as String || itemRole == kAXRadioButtonRole as String else { return }
    let title = buttonTitle(element)
    if !title.isEmpty {
      titles.append(title)
    }
  }
  return titles
}

func pressButton(exact title: String) -> Bool {
  guard let element = findElement(where: { item in
    let itemRole = role(item)
    return (itemRole == kAXButtonRole as String || itemRole == kAXRadioButtonRole as String) && buttonTitle(item) == title
  }) else {
    return false
  }
  let result = AXUIElementPerformAction(element, kAXPressAction as CFString)
  usleep(900_000)
  return result == .success
}

func headings() -> [String] {
  guard let window = firstWindow() else { return [] }
  var items: [String] = []
  walk(window) { element in
    if role(element) == kAXHeadingRole as String {
      let title = buttonTitle(element)
      if !title.isEmpty {
        items.append(title)
      }
    }
  }
  return items
}

func joinedHeadings() -> String {
  headings().joined(separator: " | ")
}

func waitForHeading(containing keyword: String) -> String {
  _ = waitUntil(timeout: 4.5) {
    headings().contains(where: { $0.contains(keyword) })
  }
  return joinedHeadings()
}

func cgPoint(_ value: AnyObject?) -> CGPoint? {
  guard let value else { return nil }
  let ref = unsafeBitCast(value, to: AXValue.self)
  guard AXValueGetType(ref) == .cgPoint else { return nil }
  var point = CGPoint.zero
  return AXValueGetValue(ref, .cgPoint, &point) ? point : nil
}

func cgSize(_ value: AnyObject?) -> CGSize? {
  guard let value else { return nil }
  let ref = unsafeBitCast(value, to: AXValue.self)
  guard AXValueGetType(ref) == .cgSize else { return nil }
  var size = CGSize.zero
  return AXValueGetValue(ref, .cgSize, &size) ? size : nil
}

func frame(of element: AXUIElement) -> CGRect? {
  guard let origin = cgPoint(attr(element, kAXPositionAttribute)), let size = cgSize(attr(element, kAXSizeAttribute)) else {
    return nil
  }
  return CGRect(origin: origin, size: size)
}

func findTaskButton(containing keyword: String) -> AXUIElement? {
  var match: AXUIElement?
  var maxWidth: CGFloat = 0
  _ = waitUntil(timeout: 4.0) {
    guard let window = firstWindow() else { return false }
    match = nil
    maxWidth = 0
    walk(window) { element in
      let itemRole = role(element)
      let title = buttonTitle(element)
      guard (itemRole == kAXButtonRole as String || itemRole == kAXRadioButtonRole as String) && title.contains(keyword) else { return }
      guard let rect = frame(of: element), rect.width > 40, rect.height > 18 else { return }
      if rect.width > maxWidth {
        maxWidth = rect.width
        match = element
      }
    }
    return match != nil
  }
  return match
}

func postMouse(_ type: CGEventType, at point: CGPoint) {
  let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)
  event?.post(tap: .cghidEventTap)
}

func firstButtonTitle(containing keyword: String) -> String? {
  allButtonTitles().first(where: { $0.contains(keyword) })
}

func dragTask(element: AXUIElement, screenshotName: String) -> DragCheck {
  guard let rect = frame(of: element) else {
    return DragCheck(taskTitleBefore: buttonTitle(element), taskTitleAfter: buttonTitle(element), frame: nil, changedAfterDrop: false)
  }
  let beforeTitle = buttonTitle(element)
  let start = CGPoint(x: rect.midX, y: rect.midY)
  let end = CGPoint(x: rect.midX + min(140, rect.width * 0.85), y: rect.midY)
  postMouse(.mouseMoved, at: start)
  usleep(160_000)
  postMouse(.leftMouseDown, at: start)
  usleep(180_000)
  postMouse(.leftMouseDragged, at: CGPoint(x: start.x + 72, y: start.y))
  usleep(260_000)
  _ = capture(screenshotName)
  usleep(200_000)
  postMouse(.leftMouseDragged, at: end)
  usleep(180_000)
  postMouse(.leftMouseUp, at: end)
  _ = waitUntil(timeout: 2.5) {
    let after = firstButtonTitle(containing: "1234344") ?? ""
    return !after.isEmpty && after != beforeTitle
  }
  let afterTitle = firstButtonTitle(containing: "1234344") ?? buttonTitle(element)
  return DragCheck(taskTitleBefore: beforeTitle.isEmpty ? nil : beforeTitle, taskTitleAfter: afterTitle.isEmpty ? nil : afterTitle, frame: NSStringFromRect(rect), changedAfterDrop: beforeTitle != afterTitle)
}

activateApp()
_ = waitUntil(timeout: 5.0) { firstWindow() != nil && !allButtonTitles().isEmpty }
usleep(600_000)

var screenshots: [String: String] = [:]
var checks: [String: String] = [:]
var issues: [String] = []

checks["initialHeadings"] = joinedHeadings()
screenshots["initial"] = capture("01-initial.png")

if pressButton(exact: "看板") {
  checks["kanbanHeadings"] = waitForHeading(containing: "看板")
  screenshots["kanban"] = capture("02-kanban.png")
} else {
  issues.append("KANBAN_SWITCH_FAILED")
}

if pressButton(exact: "时间线") {
  checks["timelineHeadings"] = waitForHeading(containing: "时间线")
  screenshots["timelineBeforeDrag"] = capture("03-timeline-before-drag.png")
} else {
  issues.append("TIMELINE_SWITCH_FAILED")
}

let reminderCandidates = ["提前 15 分钟", "提前 30 分钟", "提前 1 小时", "提前 2 小时", "提前 1 天", "自定义提前量 30 分钟"]
_ = waitUntil(timeout: 3.0) {
  let titles = allButtonTitles()
  return titles.contains("提前 15 分钟") && titles.contains("自定义提前量 30 分钟")
}
let titlesNow = allButtonTitles()
let reminderOptions = reminderCandidates.filter { titlesNow.contains($0) }
if reminderOptions.count < reminderCandidates.count {
  issues.append("REMINDER_OPTIONS_INCOMPLETE")
}
checks["reminderOptionsVisibleCount"] = String(reminderOptions.count)

let dragResult: DragCheck
if let taskButton = findTaskButton(containing: "1234344") {
  dragResult = dragTask(element: taskButton, screenshotName: "04-timeline-mid-drag.png")
  screenshots["timelineAfterDrag"] = capture("05-timeline-after-drag.png")
  checks["timelineTaskAfterDrag"] = dragResult.taskTitleAfter ?? ""
  if !dragResult.changedAfterDrop {
    issues.append("TIMELINE_DRAG_DID_NOT_CHANGE_TITLE")
  }
} else {
  dragResult = DragCheck(taskTitleBefore: nil, taskTitleAfter: nil, frame: nil, changedAfterDrop: false)
  issues.append("TIMELINE_TASK_NOT_FOUND")
}

if pressButton(exact: "日历") {
  checks["calendarHeadings"] = waitForHeading(containing: "月视图")
  screenshots["calendarReturn"] = capture("06-calendar-return.png")
} else {
  issues.append("CALENDAR_RETURN_FAILED")
}

if !(checks["kanbanHeadings"] ?? "").contains("看板") {
  issues.append("KANBAN_HEADING_UNEXPECTED")
}
if !(checks["timelineHeadings"] ?? "").contains("时间线") {
  issues.append("TIMELINE_HEADING_UNEXPECTED")
}
if !(checks["calendarHeadings"] ?? "").contains("月视图") {
  issues.append("CALENDAR_HEADING_UNEXPECTED")
}

let summary = Summary(
  reviewedAt: ISO8601DateFormatter().string(from: Date()),
  appPid: pid,
  evidenceDir: evidenceDir,
  screenshots: screenshots,
  checks: checks,
  reminderOptions: reminderOptions,
  drag: dragResult,
  issues: issues,
  pass: issues.isEmpty
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(summary)
try data.write(to: URL(fileURLWithPath: evidenceDir + "/summary.json"))
print(String(data: data, encoding: .utf8) ?? "")
