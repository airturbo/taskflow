from pathlib import Path
import importlib.util
import xlsxwriter

src = '/Users/turbo/WorkBuddy/20260330162606/.workbuddy/tmp/generate_visa_budget_xlsx.py'
out = Path('/Users/turbo/WorkBuddy/20260330162606/docs/visa-principal-acquiring-budget-2026-04-08.xlsx')

spec = importlib.util.spec_from_file_location('visa_budget_source', src)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
rows = mod.rows

time_rows = [
    ['T0', 'Licensing review kick-off', '先锁最前置现金流', 'Initial Service Fee', '立项时直接入预算'],
    ['T1', 'Provisional BID 批下', '记录宽限期时钟起点', 'Numeric Licensing Fee；Quarterly Minimum Fee 时钟', '确认 P-BID 生效日'],
    ['T2', 'Implementation kick-off', '防止实施拖长吃预算', 'Project Management Fee', '把月数写进里程碑'],
    ['T3', 'CIQ / 配置请求提交', '配置型一次性成本集中出现', 'Program Installation；各类证书费', '范围冻结后再提交'],
    ['T4', '测试准备与测试执行', '测试工具和人力成本混合爆发', 'VSTS；VTS；VCX；Attended Testing', '一次排准测试，减少返工'],
    ['T5', 'Endpoint activation', '自建 endpoint 大额接入费落地', 'Cloud Connect Access / EAS Installation', '与第三方方案做总成本对比'],
    ['T6', 'BIN go-live', '集中看前期开票与自动扣收', '多项 setup fee billing timing', '做上线前 billing checklist'],
    ['T7', 'Go-live 后', '从项目支出切到运营支出', 'Visa Online；VROL；VCX；Maintenance', '把 recurring fee 纳入 run-rate'],
    ['T8', '宽限期结束', '底座成本正式启动', 'Quarterly Minimum Fee', '提前倒排季度账期'],
    ['T9', '长期运营', '看利润率而不是只看 setup fee', 'Recurring fee + transaction-level fees', '持续做 run-rate 与 margin 复盘'],
]

def is_active(row):
    return row[6] != '否' and row[7] != '否'

def sum_current(kind=None, risk=None, included=None, field='suggested'):
    idx = 11 if field == 'suggested' else 12
    total = 0
    for row in rows:
        if kind and row[4] != kind:
            continue
        if risk and row[15] != risk:
            continue
        if included is not None and ((row[7] == '否') != (included == '否')):
            continue
        if included == '否':
            total += row[idx]
            continue
        if is_active(row):
            total += row[idx]
    return total

workbook = xlsxwriter.Workbook(out)
workbook.set_calc_mode('auto')
fmt_title = workbook.add_format({'bold': True, 'font_size': 14, 'bg_color': '#E2F0D9', 'border': 1})
fmt_header = workbook.add_format({'bold': True, 'font_color': 'white', 'bg_color': '#1F4E78', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True})
fmt_sub = workbook.add_format({'bold': True, 'bg_color': '#D9EAF7', 'border': 1, 'text_wrap': True, 'valign': 'top'})
fmt_text = workbook.add_format({'border': 1, 'text_wrap': True, 'valign': 'top'})
fmt_center = workbook.add_format({'border': 1, 'text_wrap': True, 'align': 'center', 'valign': 'vcenter'})
fmt_input = workbook.add_format({'border': 1, 'text_wrap': True, 'valign': 'top', 'bg_color': '#FFF2CC'})
fmt_warn = workbook.add_format({'border': 1, 'text_wrap': True, 'valign': 'top', 'bg_color': '#FCE4D6'})
fmt_green = workbook.add_format({'border': 1, 'text_wrap': True, 'valign': 'top', 'bg_color': '#E2F0D9'})
fmt_money = workbook.add_format({'border': 1, 'num_format': '$#,##0;($#,##0);-', 'valign': 'top'})
fmt_money_input = workbook.add_format({'border': 1, 'num_format': '$#,##0;($#,##0);-', 'bg_color': '#FFF2CC', 'valign': 'top'})
fmt_money_sum = workbook.add_format({'border': 1, 'num_format': '$#,##0;($#,##0);-', 'bg_color': '#E2F0D9', 'bold': True})

ws = workbook.add_worksheet('预算说明')
ws.write('A1', 'Visa Principal Acquiring 预算版 Excel', fmt_title)
ws.write_row('A3', ['项目', '内容'], fmt_header)
info = [
    ['来源文件', 'Projected Setup Cost  Principal Acquiring070426.pdf'],
    ['预算口径', '一次性基线 + 可选事件缓冲 + 年化经常性；交易级费率单独待补'],
    ['建议用法', '先在“预算清单”确定适用项和是否纳入预算，再看“预算汇总”读当前预算与压力预算'],
    ['关键字段', '“是否适用”“是否纳入预算”可直接改；当前纳入预算和压力预算会自动汇总'],
    ['注意', '带范围的项目默认采用建议预算和压力预算双口径；最新收费仍以 Visa Fee Schedule / Visa Online / MIDAS 正式回复为准'],
]
for i, row in enumerate(info, start=3):
    ws.write(i, 0, row[0], fmt_sub)
    ws.write(i, 1, row[1], fmt_text)
ws.set_column('A:A', 18)
ws.set_column('B:B', 104)
ws.freeze_panes(3, 0)

ws = workbook.add_worksheet('预算清单')
headers = ['ID', '阶段/节点', '费用项', '费用分组', '预算口径', '是否必选', '是否适用', '是否纳入预算', '预算 Owner', '预计发生时点', '金额下限(USD)', '建议预算(USD)', '压力预算(USD)', '当前纳入预算(USD)', '当前压力预算(USD)', '备注/假设', '待确认问题', '风险等级', '下一步动作']
for col, title in enumerate(headers):
    ws.write(0, col, title, fmt_header)
for idx, row in enumerate(rows, start=1):
    active = is_active(row)
    current = row[11] if active else 0
    stress = row[12] if active else 0
    values = row[:10] + row[10:13]
    for col, value in enumerate(values):
        if col in [10, 11, 12]:
            ws.write_number(idx, col, value, fmt_money)
        else:
            fmt = fmt_input if col in [6, 7] else fmt_text
            ws.write(idx, col, value, fmt)
    excel_row = idx + 1
    ws.write_formula(idx, 13, f'=IF(OR(G{excel_row}="否",H{excel_row}="否"),0,L{excel_row})', fmt_money, current)
    ws.write_formula(idx, 14, f'=IF(OR(G{excel_row}="否",H{excel_row}="否"),0,M{excel_row})', fmt_money, stress)
    ws.write(idx, 15, row[13], fmt_text)
    ws.write(idx, 16, row[14], fmt_text)
    risk_fmt = fmt_warn if row[15] == '高' else (fmt_input if row[15] == '中' else fmt_green)
    ws.write(idx, 17, row[15], risk_fmt)
    ws.write(idx, 18, row[16], fmt_text)
ws.data_validation(1, 5, len(rows), 7, {'validate': 'list', 'source': ['是', '否', '待定']})
ws.data_validation(1, 17, len(rows), 17, {'validate': 'list', 'source': ['高', '中', '低']})
ws.autofilter(0, 0, len(rows), len(headers) - 1)
ws.freeze_panes(1, 0)
widths = [10, 24, 34, 16, 16, 10, 10, 12, 28, 26, 14, 14, 14, 16, 16, 28, 42, 10, 30]
for i, width in enumerate(widths):
    ws.set_column(i, i, width)

ws = workbook.add_worksheet('预算汇总')
ws.write_row('A1', ['指标', '当前预算(USD)', '压力预算(USD)', '说明'], fmt_header)
summary_defs = [
    ('一次性基线', '一次性基线', 'License / Implementation / Testing / Access 等项目型成本'),
    ('可选事件缓冲', '可选事件缓冲', '用于改期、取消、加急等缓冲'),
    ('年化经常性', '年化经常性', '按首年 run-rate 年化'),
    ('待补费率', '待补费率', '交易级费率暂未纳入'),
]
current_totals = {}
stress_totals = {}
for kind, _, _ in summary_defs:
    current_totals[kind] = sum_current(kind=kind, field='suggested')
    stress_totals[kind] = sum_current(kind=kind, field='stress')
for row_idx, (label, kind, note) in enumerate(summary_defs, start=1):
    excel_row = row_idx + 1
    ws.write(row_idx, 0, label, fmt_sub)
    ws.write_formula(row_idx, 1, f'=SUMIFS(预算清单!$N:$N,预算清单!$E:$E,"{kind}")', fmt_money_sum, current_totals[kind])
    ws.write_formula(row_idx, 2, f'=SUMIFS(预算清单!$O:$O,预算清单!$E:$E,"{kind}")', fmt_money_sum, stress_totals[kind])
    ws.write(row_idx, 3, note, fmt_text)
ws.write(5, 0, '总预算（不含待补费率）', fmt_sub)
ws.write_formula(5, 1, '=SUM(B2:B4)', fmt_money_sum, current_totals['一次性基线'] + current_totals['可选事件缓冲'] + current_totals['年化经常性'])
ws.write_formula(5, 2, '=SUM(C2:C4)', fmt_money_sum, stress_totals['一次性基线'] + stress_totals['可选事件缓冲'] + stress_totals['年化经常性'])
ws.write(5, 3, '当前最可执行预算口径', fmt_text)
ws.write(6, 0, '高风险已纳入预算', fmt_sub)
ws.write_formula(6, 1, '=SUMIFS(预算清单!$N:$N,预算清单!$R:$R,"高")', fmt_money_sum, sum_current(risk='高', field='suggested'))
ws.write_formula(6, 2, '=SUMIFS(预算清单!$O:$O,预算清单!$R:$R,"高")', fmt_money_sum, sum_current(risk='高', field='stress'))
ws.write(6, 3, '优先盯防高风险项', fmt_text)
ws.write(7, 0, '未纳入预算的建议预算', fmt_sub)
ws.write_formula(7, 1, '=SUMIFS(预算清单!$L:$L,预算清单!$H:$H,"否")', fmt_money_sum, sum_current(included='否', field='suggested'))
ws.write_formula(7, 2, '=SUMIFS(预算清单!$M:$M,预算清单!$H:$H,"否")', fmt_money_sum, sum_current(included='否', field='stress'))
ws.write(7, 3, '这些是潜在漏预算区', fmt_text)
ws.write('A10', '建议读法', fmt_sub)
ws.write('B10', '先看“总预算（不含待补费率）”把项目预算框住，再把“未纳入预算的建议预算”压小，最后单独补 transaction fee schedule。', fmt_text)
ws.set_column('A:A', 22)
ws.set_column('B:C', 18)
ws.set_column('D:D', 56)
ws.freeze_panes(1, 0)

ws = workbook.add_worksheet('预算时间线')
ws.write_row('A1', ['时间点', '节点', '预算重点', '对应费用', '管理动作'], fmt_header)
for i, row in enumerate(time_rows, start=1):
    for j, value in enumerate(row):
        ws.write(i, j, value, fmt_text)
for col, width in enumerate([10, 28, 34, 40, 36]):
    ws.set_column(col, col, width)
ws.autofilter(0, 0, len(time_rows), 4)
ws.freeze_panes(1, 0)

workbook.close()
print(out)
